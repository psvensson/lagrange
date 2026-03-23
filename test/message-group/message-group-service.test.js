/**
 * Unit tests for MessageGroupService.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {EventEmitter} from 'node:events';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  MessageGroupOperationLedger,
  MessageGroupService,
  MessageStatus,
  RaftRole,
} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  SYSTEM_TABLE_NAME,
  INITIAL_PARTITION_IDS,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  COLUMN,
  CDC_OPERATION,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import LifeRaft from '@markwylde/liferaft';
import {RAFT_EVENT} from '../../src/raft/constants.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

// Port counter for unique ports per test
let testPortCounter = 24000;

function createTrafficReadinessState() {
  const emitter = new EventEmitter();
  let snapshot = {
    phase: LIFECYCLE_PHASE.INIT,
    ready: false,
    reasons: [],
  };

  return {
    getSnapshot() {
      return {...snapshot};
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
    },
    transitionTo(phase, options = {}) {
      snapshot = {
        phase,
        ready: options.ready === true,
        reasons: Array.isArray(options.reasons) ? [...options.reasons] : [],
      };
      emitter.emit('transition', {...snapshot});
      return {...snapshot};
    },
  };
}

/**
 * Create a real WebSocket transport for testing.
 * @return {Promise<{router: MessageRouter, nodeId: string, cleanup: Function}>}
 */
async function createTestTransport() {
  const port = testPortCounter++;
  const nodeId = `test-node-${port}`;
  const router = new MessageRouter({nodeId, wsPort: port});
  await router.initialize({startServer: true});
  return {
    router,
    nodeId,
    cleanup: async () => {
      await router.shutdown();
    },
  };
}

beforeEach(() => {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

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

test(
  'MessageGroupService - joinPeerNodes keeps authoritative remote same-id peer during move convergence',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-move-peer-join',
        replicaId: 'mg-move-peer-join-r1',
        nodeId,
        replicaIds: [
          'mg-move-peer-join-r1',
          'mg-move-peer-join-r2',
          'mg-move-peer-join-r3',
        ],
        peerAddresses: [
          'seed-node/message-group/mg-move-peer-join-r1',
          'seed-node/message-group/mg-move-peer-join-r2',
          'seed-node/message-group/mg-move-peer-join-r3',
        ],
        transport: router,
      });

      const joinedPeers = [];
      service.raft = {};
      service.raftProvider = {
        joinPeer: (_raft, address) => {
          joinedPeers.push(address);
        },
      };

      service.joinPeerNodes();

      t.same(
        joinedPeers,
        [
          'seed-node/message-group/mg-move-peer-join-r1',
          'seed-node/message-group/mg-move-peer-join-r2',
          'seed-node/message-group/mg-move-peer-join-r3',
        ],
        'move convergence should join the authoritative remote same-id peer alongside the other canonical peers',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - reconcileRaftPeersFromCache keeps authoritative remote same-id peer during move convergence',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-move-peer-reconcile',
        replicaId: 'mg-move-peer-reconcile-r1',
        nodeId,
        transport: router,
      });

      const joinedPeers = [];
      service.raft = {
        nodes: [],
        leave: () => {},
      };
      service.raftProvider = {
        joinPeer: (_raft, address) => {
          joinedPeers.push(address);
        },
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-move-peer-reconcile-r1',
          [COLUMN.GROUP_ID]: 'mg-move-peer-reconcile',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]: 'seed-node/message-group/mg-move-peer-reconcile-r1',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-move-peer-reconcile-r2',
          [COLUMN.GROUP_ID]: 'mg-move-peer-reconcile',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]: 'seed-node/message-group/mg-move-peer-reconcile-r2',
        },
      );

      service.reconcileRaftPeersFromCache();

      t.same(
        joinedPeers,
        [
          'seed-node/message-group/mg-move-peer-reconcile-r1',
          'seed-node/message-group/mg-move-peer-reconcile-r2',
        ],
        'cache reconciliation should retain the authoritative remote same-id peer until the local handoff is canonical',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation defers on join-suppressed followers',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-join-defer',
        replicaId: 'mg-strict-join-defer-r1',
        nodeId,
        transport: router,
      });

      service.canAcceptCDCEvent = () => ({
        ready: false,
        reason: 'join convergence incomplete',
        retryAfterMs: 250,
      });
      service.forwardCDCEventToLeader = async () => {
        throw new Error('should not forward while strict readiness is deferred');
      };
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-join-defer',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {id: 'node-a', status: 'ready'},
        },
      );

      t.equal(result.acknowledged, true, 'join-suppressed strict propagation should acknowledge receipt');
      t.equal(result.success, false, 'join-suppressed strict propagation should defer instead of succeeding');
      t.equal(result.deferRetry, true, 'join-suppressed strict propagation should surface typed defer semantics');
      t.equal(result.retryAfterMs, 250, 'join-suppressed strict propagation should preserve retry hint');
      t.match(result.error, /join convergence incomplete/i, 'join-suppressed strict propagation should preserve the defer reason');
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation uses canonical local ingress during join convergence when owner row moved',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-local-join-ingress',
        replicaId: 'mg-strict-local-join-ingress-r1',
        nodeId,
        replicaIds: [
          'mg-strict-local-join-ingress-r1',
          'mg-strict-local-join-ingress-r2',
          'mg-strict-local-join-ingress-r3',
        ],
        transport: router,
      });

      service.isJoiningExistingGroup = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'canonical local join ingress should not forward strict CDC again',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-local-join-ingress',
          [COLUMN.LEADER_NODE_ID]: nodeId,
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-join-ingress-r1',
          [COLUMN.GROUP_ID]: 'mg-strict-local-join-ingress',
          [COLUMN.NODE_ID]: nodeId,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            `${nodeId}/message-group/mg-strict-local-join-ingress-r1`,
          [COLUMN.RAFT_ROLE]: RaftRole.FOLLOWER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-join-ingress-r3',
          [COLUMN.GROUP_ID]: 'mg-strict-local-join-ingress',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            'seed-node/message-group/mg-strict-local-join-ingress-r3',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now() - 1,
        },
      );

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(
        readiness.ready,
        true,
        'canonical leader_node_id on the local join-suppressed replica should keep strict CDC ingress routable',
      );
      t.equal(
        readiness.localIngress,
        true,
        'strict readiness should identify the canonical local ingress path',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-local-join-ingress',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-local-join-ingress',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(result.acknowledged, true, 'canonical local ingress should acknowledge strict CDC');
      t.equal(
        result.success,
        undefined,
        'canonical local ingress should consume strict CDC locally rather than returning a deferred failure',
      );
      t.equal(
        service.systemTableCache.get(TABLES.NODES, 'node-strict-local-join-ingress')?.[
          COLUMN.STATUS
        ],
        SERVICE_STATUS.ACTIVE,
        'canonical local ingress should apply the strict CDC event to the local cache during join convergence',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation uses local live leader hints during join convergence before owner-row cache catches up',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-local-live-hint',
        replicaId: 'mg-strict-local-live-hint-r1',
        nodeId,
        replicaIds: [
          'mg-strict-local-live-hint-r1',
          'mg-strict-local-live-hint-r2',
          'mg-strict-local-live-hint-r3',
        ],
        transport: router,
      });

      service.isJoiningExistingGroup = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId = 'mg-strict-local-live-hint-r1';
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'local live leader join hints should not re-forward strict CDC',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-local-live-hint',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-live-hint-r1',
          [COLUMN.GROUP_ID]: 'mg-strict-local-live-hint',
          [COLUMN.NODE_ID]: nodeId,
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.ADDRESS]:
            `${nodeId}/message-group/mg-strict-local-live-hint-r1`,
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now(),
        },
      );

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(
        readiness.ready,
        true,
        'local live leader hints should keep strict CDC ingress routable while the owner-row cache is still stale',
      );
      t.equal(
        readiness.localIngress,
        true,
        'strict readiness should identify local live leader hints as a join-convergence ingress signal',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-local-live-hint',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-local-live-hint',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(result.acknowledged, true, 'local live leader ingress should acknowledge strict CDC');
      t.equal(
        service.systemTableCache.get(TABLES.NODES, 'node-strict-local-live-hint')?.[
          COLUMN.STATUS
        ],
        SERVICE_STATUS.ACTIVE,
        'local live leader ingress should apply strict CDC while authoritative owner rows catch up',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC propagation falls back to addressed local ingress during join convergence when no strict target is viable',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-strict-local-addressed-fallback',
        replicaId: 'mg-strict-local-addressed-fallback-r1',
        nodeId,
        replicaIds: [
          'mg-strict-local-addressed-fallback-r1',
          'mg-strict-local-addressed-fallback-r2',
          'mg-strict-local-addressed-fallback-r3',
        ],
        transport: router,
      });

      service.isJoiningExistingGroup = true;
      service.raft = {
        state: LifeRaft.FOLLOWER,
      };
      service.leaderId = 'mg-strict-local-addressed-fallback-r3';
      service.forwardCDCEventToLeader = async () => {
        throw new Error(
          'addressed local join ingress should not re-forward strict CDC',
        );
      };

      service.systemTableCache.applySystemTableChange(
        TABLES.MESSAGE_GROUPS,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.GROUP_ID]: 'mg-strict-local-addressed-fallback',
          [COLUMN.LEADER_NODE_ID]: 'seed-node',
        },
      );
      service.systemTableCache.applySystemTableChange(
        TABLES.SERVICES,
        CDC_OPERATION.UPSERT,
        {
          [COLUMN.SERVICE_ID]: 'mg-strict-local-addressed-fallback-r3',
          [COLUMN.GROUP_ID]: 'mg-strict-local-addressed-fallback',
          [COLUMN.NODE_ID]: 'seed-node',
          [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
          [COLUMN.STATUS]: SERVICE_STATUS.STOPPED,
          [COLUMN.ADDRESS]:
            'seed-node/message-group/mg-strict-local-addressed-fallback-r3',
          [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
          [COLUMN.UPDATED_AT]: Date.now() - 1,
        },
      );

      const readiness = service.canAcceptCDCEvent({
        tableName: TABLES.NODES,
        operation: CDC_OPERATION.UPSERT,
      });

      t.equal(
        readiness.ready,
        true,
        'join convergence should keep strict CDC ingress locally routable when no viable non-local strict target exists yet',
      );
      t.equal(
        readiness.localIngress,
        true,
        'strict readiness should fall back to the addressed local join ingress when strict targets are still stale',
      );

      const result = await service.handleLatencyCdcPropagationMessage(
        'msg-strict-local-addressed-fallback',
        {
          type: 'latency.cdc.propagation',
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          data: {
            [COLUMN.NODE_ID]: 'node-strict-local-addressed-fallback',
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          },
        },
      );

      t.equal(result.acknowledged, true, 'addressed local fallback should acknowledge strict CDC');
      t.equal(
        service.systemTableCache.get(TABLES.NODES, 'node-strict-local-addressed-fallback')?.[
          COLUMN.STATUS
        ],
        SERVICE_STATUS.ACTIVE,
        'addressed local fallback should apply strict CDC while strict target metadata converges',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - strict CDC forward retries selection after authoritative topology repair',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-forward-repair',
        replicaId: 'mg-forward-repair-r3',
        nodeId,
        transport: router,
      });

      let selectionCalls = 0;
      let repairCalls = 0;
      let deliveredAddress = null;
      service.resolveCDCForwardSelection = () => {
        selectionCalls += 1;
        if (selectionCalls === 1) {
          return {
            strictForwarding: true,
            strictForwardRetryAfterMs: 250,
            targets: [],
            suppressedCount: 0,
          };
        }
        return {
          strictForwarding: true,
          strictForwardRetryAfterMs: 250,
          targets: [{
            serviceId: 'mg-forward-repair-r1',
            address: 'peer-node-a/message-group/mg-forward-repair-r1',
          }],
          suppressedCount: 0,
        };
      };
      service.maybeRepairAuthoritativeForwardTopology = async () => {
        repairCalls += 1;
        return true;
      };
      service.transport.deliver = async (address) => {
        deliveredAddress = address;
        return {acknowledged: true, success: true};
      };

      await service.forwardCDCPayloadToLeader(
        {type: 'CDC_PROPAGATION'},
        {
          tableName: TABLES.NODES,
          operation: CDC_OPERATION.UPSERT,
          causeId: 'cause-forward-repair',
        },
      );

      t.equal(repairCalls, 1,
        'strict forward should run one bounded authoritative repair before failing');
      t.equal(selectionCalls, 2,
        'strict forward should recompute selection after repair');
      t.equal(
        deliveredAddress,
        'peer-node-a/message-group/mg-forward-repair-r1',
        'strict forward should deliver to the repaired leader target',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - leader change demotes stale local leadership without follower event',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-leader-change-demotion',
        replicaId: 'mg-leader-change-demotion-r1',
        nodeId,
        transport: router,
      });

      await service.initialize();
      t.equal(service.role, RaftRole.LEADER, 'single replica should start as leader');
      t.equal(service.leaderId, service.replicaId, 'single replica should start as self leader');
      const retryTimer = setTimeout(() => {}, 10000);
      service.leaderNodeMutationHelper.retryTimer = retryTimer;

      // Regression: liferaft may emit a leader-change notification without a
      // separate follower event when leadership moves away from the local replica.
      service.raft.emit(
        RAFT_EVENT.LEADER_CHANGE,
        'node-2/message-group/mg-leader-change-demotion-r2',
      );

      t.equal(service.role, RaftRole.FOLLOWER, 'leader-change should demote local role');
      t.equal(service.isLeader, false, 'leader-change should clear leader flag');
      t.equal(
        service.leaderId,
        'mg-leader-change-demotion-r2',
        'leader-change should normalize the new leader to a replica id',
      );
      t.equal(
        service.leaderNodeUpdateRetryTimer,
        null,
        'leader-change demotion should clear pending leader-node retry timer',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - forward rejection logs bounded leader diagnostics',
  async (t) => {
    const transport = {
      async deliver() {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: 'No handler for address: remote-node/message-group/mg-forward-diag-r2',
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const warningLogs = [];
    const service = new MessageGroupService({
      groupId: 'mg-forward-diag',
      replicaId: 'mg-forward-diag-r1',
      nodeId: 'node-forward-diag',
      transport,
    });
    service.logger.warn = (msg, fields) => {
      warningLogs.push({msg, fields});
    };
    service.resolveCDCForwardSelection = () => ({
      strictForwarding: true,
      strictForwardRetryAfterMs: 275,
      targets: [{
        serviceId: 'mg-forward-diag-r2',
        address: 'remote-node/message-group/mg-forward-diag-r2',
      }],
      suppressedCount: 0,
    });
    service.maybeRepairAuthoritativeForwardTopology = async () => false;
    service.shouldRepairForwardTopology = () => false;
    service.shouldSuppressForwardTarget = () => false;

    await t.rejects(
      service.forwardCDCPayloadToLeader(
        {type: 'CDC_PROPAGATION'},
        {
          tableName: TABLES.SERVICES,
          operation: CDC_OPERATION.UPSERT,
          causeId: 'cause-forward-diagnostics',
        },
      ),
      /forward/i,
      'strict forwarding should still fail closed on handler rejection',
    );

    t.equal(warningLogs.length, 1, 'should log one bounded rejection event');
    t.equal(warningLogs[0]?.msg, 'CDC forward to leader rejected');
    t.equal(warningLogs[0]?.fields?.leaderServiceId, 'mg-forward-diag-r2',
      'warning should identify the rejected leader service');
    t.equal(
      warningLogs[0]?.fields?.deliveryRejectedByHandler,
      true,
      'warning should classify handler rejection explicitly',
    );
    t.equal(warningLogs[0]?.fields?.noHandler, true,
      'warning should preserve the no-handler signal');
    t.equal(warningLogs[0]?.fields?.acknowledged, true,
      'warning should preserve delivery acknowledgement state');
    t.equal(warningLogs[0]?.fields?.success, false,
      'warning should preserve delivery success state');
    t.equal(warningLogs[0]?.fields?.strictForwarding, true,
      'warning should indicate strict forwarding mode');
    t.equal(warningLogs[0]?.fields?.strictForwardRetryAfterMs, 275,
      'warning should preserve strict forwarding retry-after');
  });

test('MessageGroupService - buildPeerAddress follows cache updates after relocation', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const peerId = 'mg-1-r2';
    const initialAddress = 'peer-node-a/message-group/mg-1-r2';
    const relocatedAddress = 'peer-node-b/message-group/mg-1-r2';

    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1', 'mg-1-r2'],
      peerAddresses: [`stale-node/message-group/${peerId}`],
      transport: router,
    });

    service.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
      service_id: peerId,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'peer-node-a',
      group_id: 'mg-1',
      replica_id: peerId,
      status: SERVICE_STATUS.ACTIVE,
      address: initialAddress,
      updated_at: Date.now(),
    });

    t.equal(
      service.buildPeerAddress(peerId),
      initialAddress,
      'should resolve initial location from services cache',
    );

    service.systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
      service_id: peerId,
      node_id: 'peer-node-b',
      address: relocatedAddress,
      updated_at: Date.now() + 1,
    });

    t.equal(
      service.buildPeerAddress(peerId),
      relocatedAddress,
      'should resolve relocated address from refreshed cache entry',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - buildPeerAddress logs structured diagnostics ' +
  'on hint fallback', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const peerId = 'mg-1-r2';
    const hintAddress = `seed-node/message-group/${peerId}`;
    const warningLogs = [];

    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1', 'mg-1-r2'],
      peerAddresses: [hintAddress],
      transport: router,
    });

    const originalWarn = service.logger.warn?.bind(service.logger);
    service.logger.warn = (msg, fields) => {
      warningLogs.push({msg, fields});
      if (originalWarn) {
        return originalWarn(msg, fields);
      }
    };

    t.equal(
      service.buildPeerAddress(peerId),
      hintAddress,
      'should use bootstrap hint when cache location is missing',
    );
    t.equal(
      service.buildPeerAddress(peerId),
      hintAddress,
      'repeated fallback should still resolve via bootstrap hint',
    );
    t.equal(warningLogs.length, 1, 'should emit fallback diagnostics only once per peer');
    t.equal(
      warningLogs[0]?.fields?.resolutionSource,
      'bootstrap_hint',
      'fallback diagnostics should identify bootstrap hint source',
    );
  } finally {
    await cleanup();
  }
});

test(
  'MessageGroupService - cache reconciliation refreshes moved peers and joins new replicas',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const systemTableCache = new SystemTableCache();
      systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
        service_id: 'mg-1-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: nodeId,
        group_id: 'mg-1',
        replica_id: 'mg-1-r1',
        status: SERVICE_STATUS.ACTIVE,
      });
      systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
        service_id: 'mg-1-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'node-new',
        group_id: 'mg-1',
        replica_id: 'mg-1-r2',
        status: SERVICE_STATUS.ACTIVE,
      });

      const joinedAddresses = [];
      const leftAddresses = [];
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        replicaIds: ['mg-1-r1', 'mg-1-r2'],
        peerAddresses: ['node-old/message-group/mg-1-r2'],
        transport: router,
      });

      service.raft = {
        nodes: [{address: 'node-old/message-group/mg-1-r2'}],
        leave(address) {
          leftAddresses.push(address);
          this.nodes = this.nodes.filter((node) => node?.address !== address);
        },
      };
      service.raftProvider = {
        joinPeer(_raft, address) {
          joinedAddresses.push(address);
          service.raft.nodes.push({address});
        },
      };

      service.systemTableCache = systemTableCache;
      await new Promise((resolve) => setImmediate(resolve));

      t.equal(
        service.buildPeerAddress('mg-1-r2'),
        'node-new/message-group/mg-1-r2',
        'cache-backed ownership should override stale bootstrap peer hints',
      );
      t.same(
        leftAddresses,
        ['node-old/message-group/mg-1-r2'],
        'stale raft peer address should be replaced when ownership moves',
      );
      t.same(
        joinedAddresses,
        ['node-new/message-group/mg-1-r2'],
        'reconciliation should join the moved peer from cache rows',
      );

      systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
        service_id: 'mg-1-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'node-3',
        group_id: 'mg-1',
        replica_id: 'mg-1-r3',
        status: SERVICE_STATUS.ACTIVE,
      });
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      t.same(
        joinedAddresses,
        [
          'node-new/message-group/mg-1-r2',
          'node-3/message-group/mg-1-r3',
        ],
        'newly visible peers should be joined from later cache rows',
      );
      t.ok(
        service.replicaIds.includes('mg-1-r3'),
        'replicaIds should expand to include cache-discovered peers',
      );
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - publishes leader state as follower metadata in services table', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: nodeId,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
  });

  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await service.initialize();
    service.systemTableCache = systemTableCache;
    service.setCdcIntegrationService(mockCdcIntegrationService);

    await new Promise((resolve) => setImmediate(resolve));

    const roleUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
        update.whereClause?.service_id === 'mg-1-r1' &&
        update.data?.raft_role === RaftRole.FOLLOWER,
    );

    t.ok(roleUpdate, 'raft role update should be persisted via CDC');
    t.same(
      roleUpdate?.options?.expectedCacheFields,
      {
        raft_role: RaftRole.FOLLOWER,
      },
      'raft role cache wait should converge only the role field',
    );
    t.equal(
      roleUpdate?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      'raft role persistence should route through repairEligible readiness',
    );
    t.equal(
      roleUpdate?.options?.deliveryPriority,
      'background',
      'message-group raft-role publication should be advisory background metadata',
    );
    t.equal(
      roleUpdate?.options?.workClass,
      'background',
      'message-group raft-role publication should use background admission',
    );
    t.equal(
      roleUpdate?.options?.allowPressureDefer,
      true,
      'message-group raft-role publication should defer under pressure',
    );
    t.notOk(
      updates.some((update) => update.data?.raft_role === RaftRole.LEADER),
      'leader authority should not be republished through services.raft_role',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - demotes non-control-plane role publication to background', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: nodeId,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
  });

  try {
    const service = new MessageGroupService({
      groupId: 'mg-user-1',
      replicaId: 'mg-user-1-r1',
      nodeId,
      transport: router,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await service.initialize();
    service.systemTableCache = systemTableCache;
    service.setCdcIntegrationService(mockCdcIntegrationService);

    await new Promise((resolve) => setImmediate(resolve));

    const roleUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
        update.whereClause?.service_id === 'mg-user-1-r1' &&
        update.data?.raft_role === RaftRole.FOLLOWER,
    );

    t.ok(roleUpdate, 'non-control-plane role update should still be persisted');
    t.equal(
      roleUpdate?.options?.deliveryPriority,
      'background',
      'non-control-plane message-group role publication should not consume the critical lane',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - publishes candidate role as follower metadata', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
    [COLUMN.LEADER_NODE_ID]: nodeId,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'services-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: servicesPartitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'mg-1-r1',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.GROUP_ID]: 'mg-1',
    [COLUMN.REPLICA_ID]: 'mg-1-r1',
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.CANDIDATE,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/message-group/mg-1-r1`,
    [COLUMN.UPDATED_AT]: 1,
  });

  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await service.initialize();
    service.systemTableCache = systemTableCache;
    service.setCdcIntegrationService(mockCdcIntegrationService);
    updates.length = 0;

    service.queueRoleUpdate(RaftRole.CANDIDATE);
    await new Promise((resolve) => setImmediate(resolve));

    const candidateUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.SERVICES &&
        update.whereClause?.service_id === 'mg-1-r1',
    );

    t.ok(
      candidateUpdate,
      'candidate publication should normalize stale cache metadata back to follower',
    );
    t.equal(
      candidateUpdate?.data?.raft_role,
      RaftRole.FOLLOWER,
      'candidate publication should rewrite advisory metadata to follower',
    );
    t.equal(
      service.persistedRole,
      RaftRole.FOLLOWER,
      'candidate publication should still converge the advisory metadata role to follower',
    );
    t.notOk(
      updates.some((update) => update.data?.raft_role === RaftRole.CANDIDATE),
      'candidate metadata should not be written to services',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test(
  'MessageGroupService - can suppress global raft-role publication for local-only groups',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const updates = [];
    const mockCdcIntegrationService = {
      updateSystemTableRow: async (tableName, whereClause, data, options) => {
        updates.push({tableName, whereClause, data, options});
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: nodeId,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
    });

    try {
      const service = new MessageGroupService({
        groupId: 'mg-local-only',
        replicaId: 'mg-local-only-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
        publishRoleMetadata: false,
      });

      await service.initialize();
      service.systemTableCache = systemTableCache;
      service.setCdcIntegrationService(mockCdcIntegrationService);
      service.queueRoleUpdate(RaftRole.LEADER);
      await new Promise((resolve) => setImmediate(resolve));

      t.notOk(
        updates.find((update) => update.tableName === SYSTEM_TABLE_NAME.SERVICES),
        'role publication should stay local when global role metadata is disabled',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - rewrites stale leader cache metadata to follower',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    let updateCalls = 0;
    const mockCdcIntegrationService = {
      updateSystemTableRow: async () => {
        updateCalls += 1;
        return {success: true};
      },
    };
    const systemTableCache = new SystemTableCache();
    const servicesPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICES];
    systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.SERVICES,
      [COLUMN.LEADER_NODE_ID]: nodeId,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.SERVICE_ID]: 'services-leader',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.PARTITION_ID]: servicesPartitionId,
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/partition/services-leader`,
    });
    systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.SERVICE_ID]: 'mg-1-r1',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.GROUP_ID]: 'mg-1',
      [COLUMN.REPLICA_ID]: 'mg-1-r1',
      [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: `${nodeId}/message-group/mg-1-r1`,
      [COLUMN.UPDATED_AT]: Date.now(),
    });

    try {
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
      });

      service.systemTableCache = systemTableCache;
      service.pendingRoleUpdate = RaftRole.LEADER;
      service.persistedRole = null;

      await service.flushRoleUpdate();

      t.equal(updateCalls, 1, 'stale leader metadata should be rewritten once');
      t.equal(service.persistedRole, RaftRole.FOLLOWER, 'persisted role should converge to follower metadata');
      t.equal(service.pendingRoleUpdate, null, 'pending role should clear once cache matches');
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - flushes services role update when local services leader exists',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const updates = [];
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) => tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };

    try {
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
      });

      service.systemTableCache = new SystemTableCache();
      service.pendingRoleUpdate = RaftRole.LEADER;
      service.persistedRole = null;

      const result = await service.flushRoleUpdate();

      t.equal(result.reason, 'applied', 'should persist when the local services leader owns the write');
      t.equal(updates.length, 1, 'should issue one services-table write');
      t.equal(updates[0].tableName, SYSTEM_TABLE_NAME.SERVICES, 'should target services');
      t.same(updates[0].whereClause, {
        [COLUMN.SERVICE_ID]: 'mg-1-r1',
      }, 'should update the local message-group service row');
      t.equal(
        updates[0].data?.raft_role,
        RaftRole.FOLLOWER,
        'canonical leader ownership should publish follower metadata only',
      );
      t.notOk(
        Object.prototype.hasOwnProperty.call(updates[0].data, 'status'),
        'role persistence should not rewrite lifecycle status',
      );
      t.equal(service.pendingRoleUpdate, null, 'pending role should clear after success');
      t.equal(service.persistedRole, RaftRole.FOLLOWER, 'persisted role should track the published metadata role');
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - flushes message-group leader update when local owner exists',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const updates = [];
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) =>
        tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };

    try {
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
      });

      service.systemTableCache = new SystemTableCache();
      service.isLeader = true;
      service.pendingLeaderNodeUpdate = nodeId;
      service.persistedLeaderNodeId = null;

      const result = await service.flushLeaderNodeUpdate();

      t.equal(
        result.reason,
        'applied',
        'should persist when the local message_groups leader owns the write',
      );
      t.equal(updates.length, 1, 'should issue one message_groups-table write');
      t.equal(
        updates[0].tableName,
        SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
        'should target message_groups',
      );
      t.same(updates[0].whereClause, {
        [COLUMN.GROUP_ID]: 'mg-1',
      }, 'should update the local message-group owner row');
      t.equal(
        updates[0].data?.[COLUMN.LEADER_NODE_ID],
        nodeId,
        'should publish the elected leader node id',
      );
      t.equal(
        service.pendingLeaderNodeUpdate,
        null,
        'pending leader update should clear after success',
      );
      t.equal(
        service.persistedLeaderNodeId,
        nodeId,
        'persisted leader update should track the published owner metadata',
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - publishes role metadata before traffic ready when services leader is local',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const updates = [];
    const readinessState = createTrafficReadinessState();
    const mockCdcIntegrationService = {
      canWriteSystemTableLocally: (tableName) =>
        tableName === SYSTEM_TABLE_NAME.SERVICES,
      updateSystemTableRow: async (tableName, whereClause, data) => {
        updates.push({tableName, whereClause, data});
        return {success: true};
      },
    };

    try {
      const service = new MessageGroupService({
        groupId: 'mg-1',
        replicaId: 'mg-1-r1',
        nodeId,
        transport: router,
        cdcIntegrationService: mockCdcIntegrationService,
        bootstrapReadinessState: readinessState,
      });

      service.systemTableCache = new SystemTableCache();
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.INSERT,
        {
          [COLUMN.NODE_ID]: nodeId,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
          [COLUMN.LAST_HEARTBEAT]: Date.now(),
          [COLUMN.READY_LEASE_EXPIRES_AT]: null,
        },
      );
      service.pendingRoleUpdate = RaftRole.LEADER;
      service.persistedRole = null;

      const publishResult = await service.flushRoleUpdate();
      t.equal(
        publishResult.reason,
        'applied',
        'role publication should not wait on lifecycle readiness once the local services leader can accept the write',
      );
      t.equal(
        updates.length,
        1,
        'service metadata should publish immediately when the local services leader is available',
      );

      const now = Date.now();
      service.systemTableCache.applySystemTableChange(
        TABLES.NODES,
        CDC_OPERATION.UPDATE,
        {
          [COLUMN.NODE_ID]: nodeId,
          [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
          [COLUMN.CONNECTION_STATE]: STATE.READY,
          [COLUMN.LAST_HEARTBEAT]: now,
          [COLUMN.READY_LEASE_EXPIRES_AT]: now + 60_000,
        },
      );

      readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
        ready: false,
        reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      const noopResult = await service.flushRoleUpdate();
      t.equal(noopResult.reason, 'noop', 'no duplicate write is needed after the initial publish succeeds');
      t.equal(updates.length, 1, 'later readiness transitions should not create duplicate role writes');
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - defers rebalancer initialization until traffic ready',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    const readinessState = createTrafficReadinessState();
    let service = null;

    try {
      service = new MessageGroupService({
        groupId: 'mg-ready-gate',
        replicaId: 'mg-ready-gate-r1',
        nodeId,
        transport: router,
        bootstrapReadinessState: readinessState,
      });

      service.initialized = true;
      service.systemTableCache = {
        get: () => null,
        getAll: () => [],
        filter: () => [],
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          executeQuery: async () => ({success: true, rows: []}),
        },
      };
      service.tablePolicyService = {};
      service.rebalanceCoordinator = {
        initialize: () => {},
      };
      service.isLeaderReplica = () => true;

      readinessState.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
        ready: false,
        reasons: [LIFECYCLE_REASON.LEADER_METADATA_INCOMPLETE],
      });
      service.maybeInitializeRebalancer();
      t.notOk(
        service.rebalancer,
        'should not initialize message-group rebalancer before traffic-ready lifecycle',
      );

      readinessState.transitionTo(LIFECYCLE_PHASE.TRAFFIC_READY, {
        ready: true,
        reasons: [],
      });
      service.maybeInitializeRebalancer();
      t.ok(
        service.rebalancer,
        'should initialize message-group rebalancer after traffic-ready lifecycle',
      );
    } finally {
      await service?.shutdown?.();
      await cleanup();
    }
  },
);

test('MessageGroupService - persists leader node updates to message groups table', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  const updates = [];
  const mockCdcIntegrationService = {
    updateSystemTableRow: async (tableName, whereClause, data, options) => {
      updates.push({tableName, whereClause, data, options});
      return {success: true};
    },
  };
  const systemTableCache = new SystemTableCache();
  const messageGroupsPartitionId = INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.MESSAGE_GROUPS];
  systemTableCache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.INSERT, {
    [COLUMN.PARTITION_ID]: messageGroupsPartitionId,
    [COLUMN.TABLE_ID]: SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
    [COLUMN.LEADER_NODE_ID]: nodeId,
  });
  systemTableCache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
    [COLUMN.SERVICE_ID]: 'message-groups-leader',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.PARTITION_ID]: messageGroupsPartitionId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.RAFT_ROLE]: RaftRole.LEADER,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/message-groups-leader`,
  });

  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
      cdcIntegrationService: mockCdcIntegrationService,
    });

    await service.initialize();
    service.systemTableCache = systemTableCache;
    service.setCdcIntegrationService(mockCdcIntegrationService);

    await new Promise((resolve) => setImmediate(resolve));

    const leaderUpdate = updates.find(
      (update) =>
        update.tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS &&
        update.whereClause?.[COLUMN.GROUP_ID] === 'mg-1' &&
        update.data?.[COLUMN.LEADER_NODE_ID] === nodeId,
    );

    t.ok(leaderUpdate, 'leader node update should be persisted via CDC');
    t.same(
      leaderUpdate?.options?.expectedCacheFields,
      {[COLUMN.LEADER_NODE_ID]: nodeId},
      'leader cache wait should only require canonical leader identity',
    );
    t.equal(
      leaderUpdate?.options?.routingReadinessDimension,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
      'leader node persistence should route through repairEligible readiness',
    );
    t.equal(
      leaderUpdate?.options?.deliveryPriority,
      'critical',
      'control-plane message-group leader publication should stay on the critical lane',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - sendMessage creates message envelope', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    const result = await service.sendMessage('target-service', {
      type: 'TEST',
      data: 'hello',
    });

    t.ok(result.messageId, 'Should return messageId');
    t.ok(result.status, 'Should return status');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - QUERY direct-only delivery clears pending envelope ' +
  'after success',
async (t) => {
  const transport = {
    async deliver() {
      return {
        acknowledged: true,
        success: true,
        rows: [{value: 1}],
      };
    },
    async initialize() {},
    async shutdown() {},
    setServiceNodeResolver() {},
  };

  const service = new MessageGroupService({
    groupId: 'mg-query-cleanup-success',
    replicaId: 'mg-query-cleanup-success-r1',
    nodeId: 'node-query-cleanup-success',
    transport,
  });

  service.initialized = true;
  service.retryMaxAttempts = 1;
  service.sleep = async () => {};

  const result = await service.sendMessage('node-x/partition/p1', {
    type: 'QUERY',
    sql: 'SELECT 1',
    params: [],
  });

  t.equal(result.status, MessageStatus.DELIVERED,
    'query delivery should succeed directly');
  t.equal(service.pendingMessages.size, 0,
    'direct-only success should not retain pending envelopes');
});

test('MessageGroupService - QUERY payload uses fast non-durable delivery path',
  async (t) => {
    let deliverCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        return {
          acknowledged: false,
          error: 'Message timeout',
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-query-fast-path',
      replicaId: 'mg-query-fast-path-r1',
      nodeId: 'node-query-fast-path',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {};

    let persistCalls = 0;
    service.persistToRaftLog = async () => {
      persistCalls += 1;
      return {success: true};
    };

    await t.rejects(
      service.sendMessage('node-x/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      }),
      /Message timeout/,
      'query message failure should fail fast instead of being persisted',
    );

    t.equal(deliverCalls, 1, 'query message should not retry transport delivery');
    t.equal(
      persistCalls,
      0,
      'query message should not be persisted to raft when direct delivery fails',
    );
    t.equal(service.pendingMessages.size, 0,
      'query fast-path failure should not retain pending envelopes');
  });

test('MessageGroupService - QUERY payload preserves deferred retry metadata',
  async (t) => {
    let deliverCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        return {
          acknowledged: false,
          error: 'No connection to node seed',
          errorCode: 'ROUTER_NO_CONNECTION',
          deferRetry: true,
          retryAfterMs: 250,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-query-deferred',
      replicaId: 'mg-query-deferred-r1',
      nodeId: 'node-query-deferred',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {};

    let persistCalls = 0;
    service.persistToRaftLog = async () => {
      persistCalls += 1;
      return {success: true};
    };

    try {
      await service.sendMessage('node-x/partition/p1', {
        type: 'QUERY',
        sql: 'SELECT 1',
        params: [],
      });
      t.fail('query delivery should reject when transport defers');
    } catch (error) {
      t.equal(deliverCalls, 1,
        'query message should not multiply direct retries when transport defers');
      t.equal(error?.code, 'ROUTER_NO_CONNECTION',
        'query failure should preserve the transport error code');
      t.equal(error?.deferRetry, true,
        'query failure should preserve the defer-retry hint');
      t.equal(error?.retryAfterMs, 250,
        'query failure should preserve retryAfterMs for upstream owners');
      t.equal(persistCalls, 0,
        'query delivery should still skip raft persistence on direct failure');
      t.equal(service.pendingMessages.size, 0,
        'deferred direct-only query failure should not retain pending envelopes');
    }
  });

test('MessageGroupService - idempotent control-plane payloads use direct-only delivery',
  async (t) => {
    let deliverCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        return {
          acknowledged: false,
          error: 'No connection to node seed',
          errorCode: 'ROUTER_NO_CONNECTION',
          deferRetry: true,
          retryAfterMs: 250,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-control-plane-direct',
      replicaId: 'mg-control-plane-direct-r1',
      nodeId: 'node-control-plane-direct',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {};

    let persistCalls = 0;
    service.persistToRaftLog = async () => {
      persistCalls += 1;
      return {success: true};
    };

    try {
      await service.sendMessage('seed-node/message-group/mg-1-r1', {
        type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
        operationId: 'op-1',
      });
      t.fail('control-plane delivery should reject when transport defers');
    } catch (error) {
      t.equal(deliverCalls, 1,
        'control-plane message should not multiply direct retries');
      t.equal(error?.code, 'ROUTER_NO_CONNECTION',
        'control-plane failure should preserve the transport error code');
      t.equal(error?.deferRetry, true,
        'control-plane failure should preserve defer-retry hints');
      t.equal(error?.retryAfterMs, 250,
        'control-plane failure should preserve retryAfterMs for upstream owners');
      t.equal(persistCalls, 0,
        'idempotent control-plane messages should not be persisted to raft');
      t.equal(service.pendingMessages.size, 0,
        'direct-only control-plane failure should not retain pending envelopes');
    }
  });

test('MessageGroupService - Raft CDC propose failures preserve deferred retry ' +
  'metadata for upstream owners', async (t) => {
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
    nodeId: 'node-mg-1-r2',
    transport,
  });

  const errorLogs = [];
  service.logger.error = (msg, fields) => {
    errorLogs.push({msg, fields});
  };
  service.raft = {state: LifeRaft.FOLLOWER};
  service.raftProvider = {
    async proposeWithLeaderRouting(_raft, command, options) {
      await options.forwardToLeader(command);
    },
  };
  service.forwardCDCEventToLeader = async () => {
    const error = new Error('Cannot forward CDC event because message-group leader is unknown');
    error.deferRetry = true;
    error.retryAfterMs = 5000;
    error.retryable = false;
    error.code = 'MG_LEADER_UNKNOWN';
    throw error;
  };

  try {
    await service.proposeCDCCommand({
      type: 'CDC',
      tableName: 'nodes',
      operation: 'UPDATE',
      data: {node_id: 'node-1'},
      timestamp: '123',
      causeId: 'cause-1',
    });
    t.fail('proposeCDCCommand should reject when strict forwarding defers');
  } catch (error) {
    t.match(
      error?.message,
      /Raft CDC replication failed: Cannot forward CDC event because message-group leader is unknown/,
      'wrapped error should preserve the original defer reason',
    );
    t.equal(error?.deferRetry, true,
      'wrapped raft propose error should preserve defer-retry metadata');
    t.equal(error?.retryAfterMs, 5000,
      'wrapped raft propose error should preserve retryAfterMs for upstream owners');
    t.equal(error?.retryable, false,
      'wrapped raft propose error should preserve non-retryable semantics');
    t.equal(error?.code, 'MG_LEADER_UNKNOWN',
      'wrapped raft propose error should preserve the upstream error code');
    t.equal(errorLogs.length, 1, 'should log one bounded propose failure');
    t.equal(errorLogs[0]?.msg, 'Raft CDC command failed');
    t.equal(errorLogs[0]?.fields?.isCurrentRaftLeader, false,
      'failure log should classify local leadership state');
    t.equal(errorLogs[0]?.fields?.raftState, LifeRaft.FOLLOWER,
      'failure log should preserve raft state');
    t.equal(errorLogs[0]?.fields?.leaderTargetSource, 'forward_to_leader',
      'failure log should identify the leader routing path');
    t.equal(errorLogs[0]?.fields?.configuredRetryBudget, service.retryMaxAttempts || 1,
      'failure log should preserve the configured retry budget');
    t.equal(errorLogs[0]?.fields?.proposeTimeoutMs > 0, true,
      'failure log should preserve the propose timeout budget');
  }
});

test('MessageGroupService - non-query sendMessage honors deferred retry hints',
  async (t) => {
    let deliverCalls = 0;
    let sleepCalls = 0;
    const transport = {
      async deliver() {
        deliverCalls += 1;
        return {
          acknowledged: false,
          error: 'No connection to node seed',
          errorCode: 'ROUTER_NO_CONNECTION',
          deferRetry: true,
          retryAfterMs: 250,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-deferred-retry',
      replicaId: 'mg-deferred-retry-r1',
      nodeId: 'node-deferred-retry',
      transport,
    });

    service.initialized = true;
    service.retryMaxAttempts = 4;
    service.sleep = async () => {
      sleepCalls += 1;
    };

    let persistCalls = 0;
    service.persistToRaftLog = async () => {
      persistCalls += 1;
      return {success: true};
    };

    const result = await service.sendMessage('node-x/partition/p1', {
      type: 'CDC',
      operation: 'UPDATE',
    });

    t.equal(deliverCalls, 1,
      'deferred transport failures should not multiply direct retries');
    t.equal(sleepCalls, 0,
      'deferred transport failures should not schedule retry delays');
    t.equal(result.status, MessageStatus.PENDING,
      'deferred transport failures should fall back to raft persistence');
    t.equal(persistCalls, 1,
      'non-query messages should still be persisted once for later replay');
  });

test('MessageGroupService - control-plane targets default to critical router priority',
  async (t) => {
    const deliveries = [];
    const transport = {
      async deliver(targetService, payload, options) {
        deliveries.push({targetService, payload, options});
        return {
          acknowledged: true,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-priority-default',
      replicaId: 'mg-priority-default-r1',
      nodeId: 'node-priority-default',
      transport,
    });

    service.initialized = true;
    service.persistToRaftLog = async () => ({success: true});

    await service.sendMessage(
      'seed-node/partition/services-p1-r1',
      {
        type: 'CDC',
        operation: 'UPDATE',
      },
    );

    t.equal(deliveries.length, 1, 'should perform one direct delivery attempt');
    t.equal(
      deliveries[0]?.options?.deliveryPriority,
      'critical',
      'control-plane partition targets should claim the critical router lane by default',
    );
  });

test('MessageGroupService - deferred raft responses use the critical router lane',
  async (t) => {
    const deliveries = [];
    const transport = {
      async deliver(targetService, payload, options) {
        deliveries.push({targetService, payload, options});
        return {
          acknowledged: false,
          error: 'Connection to node seed closed',
          errorCode: 'ROUTER_CONNECTION_CLOSED',
          deferRetry: true,
          retryAfterMs: 200,
        };
      },
      async initialize() {},
      async shutdown() {},
      setServiceNodeResolver() {},
    };

    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'node-mg-1',
      transport,
    });

    service.initialized = true;
    service.raft = {
      emit(_eventName, payload, write) {
        write({
          type: 'voted',
          term: payload.term,
          address: payload.address,
        });
      },
    };

    const result = await service.receiveMessage({
      payload: {
        type: 'vote',
        term: 3,
        address: 'seed/message-group/mg-1-r2',
      },
    });

    t.equal(result.acknowledged, true,
      'raft packets should still acknowledge local handling');
    t.equal(deliveries.length, 1,
      'raft response delivery should still be attempted once');
    t.equal(
      deliveries[0]?.options?.deliveryPriority,
      'critical',
      'raft response delivery to mg-1 should claim the critical router lane',
    );
  });

test('MessageGroupService - receiveMessage processes message', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let receivedMessage = null;
    service.on('messageReceived', (msg) => {
      receivedMessage = msg;
    });

    const result = await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    t.equal(result.messageId, 'msg-123', 'Should return messageId');
    t.equal(result.status, 'received', 'Should return received status');
    t.ok(receivedMessage, 'Should emit messageReceived event');
    t.equal(receivedMessage.messageId, 'msg-123', 'Event should have messageId');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - receiveMessage detects duplicates', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    // First receive
    await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    // Acknowledge
    await service.acknowledgeMessage('msg-123');

    // Second receive (duplicate)
    const result = await service.receiveMessage({
      messageId: 'msg-123',
      payload: {type: 'TEST'},
      sourceGroup: 'mg-2',
      sourceReplica: 'mg-2-r1',
    });

    t.equal(result.status, 'duplicate', 'Should detect duplicate');
    t.equal(result.acknowledged, true, 'Should indicate already acknowledged');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - acknowledgeMessage marks message', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let ackEvent = null;
    service.on('messageAcknowledged', (event) => {
      ackEvent = event;
    });

    const result = await service.acknowledgeMessage('msg-123');

    t.equal(result.messageId, 'msg-123', 'Should return messageId');
    t.equal(result.status, MessageStatus.ACKNOWLEDGED, 'Should be acknowledged');
    t.ok(result.logIndex, 'Should have log index');
    t.ok(ackEvent, 'Should emit messageAcknowledged event');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - subscribeToCDC adds subscription', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    await service.subscribeToCDC('nodes');
    await service.subscribeToCDC('partitions');

    const status = service.getStatus();
    t.ok(status.cdcSubscriptions.includes('nodes'), 'Should subscribe to nodes');
    t.ok(status.cdcSubscriptions.includes('partitions'), 'Should subscribe to partitions');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - applyCDCEvent updates cache', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    await service.subscribeToCDC('nodes');

    let cdcEvent = null;
    service.on('cdcApplied', (event) => {
      cdcEvent = event;
    });

    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-1',
      address: '127.0.0.1:8080',
      status: 'active',
    });

    t.ok(cdcEvent, 'Should emit cdcApplied event');
    t.equal(cdcEvent.tableName, 'nodes', 'Event should have tableName');
    t.equal(cdcEvent.operation, 'INSERT', 'Event should have operation');

    // Verify cache was updated
    const result = await service.querySystemCache('nodes', {key: 'node-1'});
    t.ok(result, 'Should find record in cache');
    t.equal(result.address, '127.0.0.1:8080', 'Should have correct address');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - applyCDCEvent fails closed on Raft propose error', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-raft-fail',
      replicaId: 'mg-raft-fail-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    service.replicaIds = ['mg-raft-fail-r1', 'mg-raft-fail-r2'];
    if (service.raft) {
      Object.defineProperty(service.raft, 'state', {
        value: LifeRaft.LEADER,
        writable: true,
        configurable: true,
      });
    }
    await service.subscribeToCDC('nodes');

    service.raftProvider.proposeWithLeaderRouting = async () => {
      throw new Error('raft propose failed');
    };

    await t.rejects(
      service.applyCDCEvent('nodes', 'INSERT', {
        id: 'node-raft-fail',
        status: 'active',
      }),
      /raft propose failed/,
      'should surface Raft replication failure to caller',
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - applyCDCEvent defers strict CDC on ' +
  'followers before leader routing when ingress is not ready', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-strict-defer',
      replicaId: 'mg-strict-defer-r2',
      nodeId,
      transport: router,
    });

    await service.initialize();
    service.replicaIds = ['mg-strict-defer-r1', 'mg-strict-defer-r2'];
    service.role = RaftRole.FOLLOWER;
    if (service.raft) {
      Object.defineProperty(service.raft, 'state', {
        value: LifeRaft.FOLLOWER,
        writable: true,
        configurable: true,
      });
    } else {
      service.raft = {state: LifeRaft.FOLLOWER};
    }
    service.canAcceptCDCEvent = () => ({
      ready: false,
      reason: 'join convergence incomplete',
      retryAfterMs: 250,
    });
    service.forwardCDCEventToLeader = async () => {
      throw new Error('strict CDC should defer before leader routing');
    };

    try {
      await service.applyCDCEvent('nodes', 'UPDATE', {
        node_id: 'node-deferred',
        status: 'active',
      });
      t.fail(
        'follower strict CDC should defer instead of attempting leader routing',
      );
    } catch (error) {
      t.equal(error?.deferRetry, true,
        'strict CDC defer should preserve deferRetry metadata');
      t.equal(error?.retryAfterMs, 250,
        'strict CDC defer should preserve retryAfterMs');
      t.match(error?.message, /join convergence incomplete/i,
        'strict CDC defer should preserve the readiness reason');
    }

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test(
  'MessageGroupService - replicated CDC retry must re-propose even with same timestamp',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-retry-same-ts',
        replicaId: 'mg-retry-same-ts-r1',
        nodeId,
        transport: router,
      });

      await service.initialize();
      service.replicaIds = ['mg-retry-same-ts-r1', 'mg-retry-same-ts-r2'];
      if (service.raft) {
        Object.defineProperty(service.raft, 'state', {
          value: LifeRaft.LEADER,
          writable: true,
          configurable: true,
        });
      }
      await service.subscribeToCDC('nodes');

      let proposeAttempts = 0;
      service.raftProvider.proposeWithLeaderRouting = async () => {
        proposeAttempts += 1;
        if (proposeAttempts === 1) {
          throw new Error('synthetic propose failure');
        }
      };

      const retryTimestamp = '1234567890:42:test-node';
      await t.rejects(
        service.applyCDCEvent(
          'nodes',
          'INSERT',
          {id: 'node-retry-same-ts', status: 'active'},
          {timestamp: retryTimestamp},
        ),
        /synthetic propose failure/,
        'first attempt should surface replicated CDC propose failure',
      );

      await service.applyCDCEvent(
        'nodes',
        'INSERT',
        {id: 'node-retry-same-ts', status: 'active'},
        {timestamp: retryTimestamp},
      );

      t.equal(
        proposeAttempts,
        2,
        'second attempt with same timestamp should still re-propose',
      );

      const cached = service.getWritableCache().get('nodes', 'node-retry-same-ts');
      t.ok(
        cached,
        'leader path may apply locally before commit; retry path must still re-propose',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - CDC batch propagation proposes one raft command',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-batch-propose',
        replicaId: 'mg-batch-propose-r1',
        nodeId,
        transport: router,
      });

      await service.initialize();
      service.replicaIds = ['mg-batch-propose-r1', 'mg-batch-propose-r2'];
      if (service.raft) {
        Object.defineProperty(service.raft, 'state', {
          value: LifeRaft.LEADER,
          writable: true,
          configurable: true,
        });
      }
      await service.subscribeToCDC('nodes');

      const proposedCommands = [];
      service.raftProvider.proposeWithLeaderRouting = async (_raft, command) => {
        proposedCommands.push(command);
      };

      const result = await service.handleLatencyCdcPropagationBatchMessage(
        'msg-batch',
        {
          type: 'latency.cdc.propagation.batch',
          events: [
            {
              tableName: 'nodes',
              operation: 'INSERT',
              data: {id: 'node-batch-1', status: 'active'},
            },
            {
              tableName: 'nodes',
              operation: 'INSERT',
              data: {id: 'node-batch-2', status: 'ready'},
            },
          ],
        },
      );

      t.equal(result.status, 'latency_cdc_batch_propagated',
        'batched propagation should acknowledge success');
      t.equal(result.eventCount, 2,
        'batched propagation should report the full event count');
      t.equal(proposedCommands.length, 1,
        'batched propagation should propose one raft command');
      t.equal(proposedCommands[0]?.type, 'CDC_BATCH',
        'batched propagation should use the CDC_BATCH command type');
      t.equal(proposedCommands[0]?.events?.length, 2,
        'raft command should retain all batch events');

      t.ok(
        service.getWritableCache().get('nodes', 'node-batch-1'),
        'leader should apply first batched event locally',
      );
      t.ok(
        service.getWritableCache().get('nodes', 'node-batch-2'),
        'leader should apply second batched event locally',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test('MessageGroupService - CDC paths delegate to CDCHandler owner', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    t.equal(service.cdcHandler.getSubscriptions().length, 0);

    await service.subscribeToCDC('nodes');
    t.ok(service.cdcHandler.isSubscribed('nodes'));

    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-owner-1',
      status: 'active',
    });
    t.ok(service.getWritableCache().get('nodes', 'node-owner-1'));

    await service.applyCDCEvent('partitions', 'INSERT', {
      id: 'partition-owner-1',
      status: 'active',
    });
    t.equal(
      service.getWritableCache().get('partitions', 'partition-owner-1'),
      undefined,
    );

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - querySystemCache returns data', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();
    await service.subscribeToCDC('nodes');

    // Insert test data
    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-1',
      status: 'active',
    });
    await service.applyCDCEvent('nodes', 'INSERT', {
      id: 'node-2',
      status: 'inactive',
    });

    // Query by key
    const byKey = await service.querySystemCache('nodes', {key: 'node-1'});
    t.ok(byKey, 'Should find by key');
    t.equal(byKey.id, 'node-1', 'Should return correct record');

    // Query with predicate
    const filtered = await service.querySystemCache('nodes', {
      predicate: (r) => r.status === 'active',
    });
    t.equal(filtered.length, 1, 'Should filter correctly');

    // Query all
    const all = await service.querySystemCache('nodes');
    t.equal(all.length, 2, 'Should return all records');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - getReadOnlyCache returns wrapper', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    const cache = service.getReadOnlyCache();
    t.ok(cache, 'Should return cache');

    // Verify it's read-only
    t.throws(
      () => cache.applySystemTableChange('nodes', 'INSERT', {id: 'test'}),
      /not available on read-only cache/,
      'Should block write operations',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - single replica becomes leader', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      replicaIds: ['mg-1-r1'],
      peerAddresses: [`${nodeId}/message-group/mg-1-r1`],
      transport: router,
    });

    let leaderEvent = null;
    service.on('leaderElected', (event) => {
      leaderEvent = event;
    });

    await service.initialize();

    // Single replica becomes leader immediately - no need to wait
    t.equal(service.isLeaderReplica(), true, 'Should become leader');
    t.equal(service.getLeaderId(), 'mg-1-r1', 'Should be own leader');
    t.ok(leaderEvent, 'Should emit leaderElected event');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - leader activation dedupes same-term flaps', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-leader-gate',
      replicaId: 'mg-leader-gate-r1',
      replicaIds: ['mg-leader-gate-r1', 'mg-leader-gate-r2'],
      peerAddresses: [
        `${nodeId}/message-group/mg-leader-gate-r1`,
        `${nodeId}/message-group/mg-leader-gate-r2`,
      ],
      nodeId,
      transport: router,
      deferElection: true,
      leaderActivationStabilizationMs: 20,
    });

    await service.initialize();
    await service.subscribeToCDC('nodes');
    await service.subscribeToCDC('services');

    let rebalancerLeadershipUpdates = 0;
    let cdcResubscribeCalls = 0;
    let leaderEvents = 0;
    const originalSubscribeToCDC = service.subscribeToCDC.bind(service);
    service.updateRebalancerLeadership = () => {
      rebalancerLeadershipUpdates += 1;
    };
    service.subscribeToCDC = async (tableName) => {
      cdcResubscribeCalls += 1;
      return originalSubscribeToCDC(tableName);
    };
    service.on('leaderElected', () => {
      leaderEvents += 1;
    });

    service.raft.term = 11;
    service.raft.emit(RAFT_EVENT.LEADER);
    service.raft.emit(RAFT_EVENT.LEADER);
    service.raft.emit(RAFT_EVENT.LEADER);

    await new Promise((resolve) => setTimeout(resolve, 80));

    t.equal(
      rebalancerLeadershipUpdates,
      1,
      'leader-owned background work should activate once per stable term',
    );
    t.equal(
      cdcResubscribeCalls,
      2,
      'existing CDC subscriptions should be replayed once per stable term',
    );
    t.equal(leaderEvents, 1, 'leaderElected should emit once per stable term');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - getStatus returns complete status', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    const status = service.getStatus();

    t.equal(status.groupId, 'mg-1', 'Should have groupId');
    t.equal(status.replicaId, 'mg-1-r1', 'Should have replicaId');
    t.equal(status.nodeId, nodeId, 'Should have nodeId');
    t.ok(status.role, 'Should have role');
    t.equal(typeof status.term, 'number', 'Should have term');
    t.equal(typeof status.logLength, 'number', 'Should have logLength');
    t.equal(status.initialized, true, 'Should be initialized');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - rebalancer coordinator refresh uses owner sync path',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const service = new MessageGroupService({
        groupId: 'mg-sync-owner',
        replicaId: 'mg-sync-owner-r1',
        nodeId,
        transport: router,
      });
      const coordinator = {
        id: 'coordinator-b',
      };
      let setCoordinatorCalls = 0;
      const rebalancer = {
        setRebalanceCoordinator(value) {
          setCoordinatorCalls += 1;
          this.rebalanceCoordinator = value;
        },
        setLeader() {},
      };

      service.rebalanceCoordinator = coordinator;
      service.cdcIntegrationService = {sqlQueryEngine: {}};
      service.tablePolicyService = {};
      service.rebalancer = rebalancer;
      service.isLeaderReplica = () => true;

      service.maybeInitializeRebalancer();

      t.equal(
        setCoordinatorCalls,
        1,
        'should route coordinator refresh through setRebalanceCoordinator',
      );
      t.equal(
        rebalancer.rebalanceCoordinator,
        coordinator,
        'should set the refreshed coordinator on rebalancer',
      );
    } finally {
      await cleanup();
    }
  });

test('MessageGroupService routes forward-topology cache repair through the ' +
  'gateway instead of mutating the cache directly', async (t) => {
  const {router, cleanup} = await createTestTransport();
  try {
    const nodeService = NodeService.getInstance();
    nodeService.initialize({nodeId: 'node-a', autoTransitionLifecycle: false});
    const cache = {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
      applySystemTableChange() {
        throw new Error('message-group repair must not mutate cache directly');
      },
      on() {},
      off() {},
    };
    nodeService.setSystemCacheProxy(cache);

    const repairCalls = [];
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'node-a',
      replicaIds: ['mg-1-r1'],
      transport: router,
      controlPlaneSystemTableGateway: {
        reconcileAuthoritativeCacheRows(tableName, rows, options) {
          repairCalls.push({tableName, rows, options});
          return Promise.resolve({success: true, mutationCount: 1});
        },
        setCdcIntegrationService() {},
        setSqlQueryEngine() {},
        setSystemTableCache() {},
        setMessageRouter() {},
      },
    });

    const repairedRowCount = await service.applyAuthoritativeForwardTopologyRows(
      TABLES.MESSAGE_GROUPS,
      [{
        [COLUMN.GROUP_ID]: 'mg-1',
        leader_node_id: 'node-a',
      }],
    );

    t.equal(repairedRowCount, 1, 'gateway-provided repair count should propagate');
    t.equal(repairCalls.length, 1, 'forward-topology repair should delegate once');
    t.equal(
      repairCalls[0].options.deleteMissing,
      false,
      'forward-topology refresh should not delete unrelated cached rows',
    );
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - shutdown cleans up', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId,
      transport: router,
    });

    await service.initialize();

    let shutdownEvent = null;
    service.on('shutdown', (event) => {
      shutdownEvent = event;
    });

    await service.shutdown();

    t.equal(service.initialized, false, 'Should not be initialized');
    t.ok(shutdownEvent, 'Should emit shutdown event');
    t.equal(shutdownEvent.groupId, 'mg-1', 'Event should have groupId');
  } finally {
    await cleanup();
  }
});

test('MessageGroupOperationLedger - appendEntry adds entries', async (t) => {
  const storage = new MessageGroupOperationLedger();

  const entry1 = storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  const entry2 = storage.appendEntry({type: 'MESSAGE', data: 'test2'});

  t.equal(entry1.index, 1, 'First entry should have index 1');
  t.equal(entry2.index, 2, 'Second entry should have index 2');
  t.equal(storage.getLogLength(), 2, 'Should have 2 entries');
});

test('MessageGroupOperationLedger - retains a bounded rolling window', async (t) => {
  const storage = new MessageGroupOperationLedger({maxEntries: 2});

  const entry1 = storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  const entry2 = storage.appendEntry({type: 'MESSAGE', data: 'test2'});
  const entry3 = storage.appendEntry({type: 'MESSAGE', data: 'test3'});

  t.equal(storage.getLogLength(), 2, 'Should retain only the bounded number of entries');
  t.equal(storage.getEntry(entry1.index), null, 'Old trimmed entries should no longer be addressable');
  t.equal(storage.getEntry(entry2.index)?.data?.data, 'test2', 'Should retain newer entries');
  t.equal(storage.getLastEntry()?.index, entry3.index, 'Newest entry should retain its monotonic index');
});

test('MessageGroupOperationLedger - getEntriesFrom returns entries', async (t) => {
  const storage = new MessageGroupOperationLedger();

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});
  storage.appendEntry({type: 'MESSAGE', data: 'test3'});

  const fromStart = storage.getEntriesFrom(1);
  t.equal(fromStart.length, 3, 'Should return all entries from start');

  const fromMiddle = storage.getEntriesFrom(2);
  t.equal(fromMiddle.length, 2, 'Should return entries from index 2');
  t.equal(fromMiddle[0].data.data, 'test2', 'First should be test2');
});

test('MessageGroupOperationLedger - getLastEntry returns last', async (t) => {
  const storage = new MessageGroupOperationLedger();

  t.equal(storage.getLastEntry(), null, 'Should return null when empty');

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});

  const last = storage.getLastEntry();
  t.equal(last.data.data, 'test2', 'Should return last entry');
});

test('MessageGroupOperationLedger - truncateFrom removes entries', async (t) => {
  const storage = new MessageGroupOperationLedger();

  storage.appendEntry({type: 'MESSAGE', data: 'test1'});
  storage.appendEntry({type: 'MESSAGE', data: 'test2'});
  storage.appendEntry({type: 'MESSAGE', data: 'test3'});

  storage.truncateFrom(2);

  t.equal(storage.getLogLength(), 1, 'Should have 1 entry after truncate');
  t.equal(storage.getLastEntry().data.data, 'test1', 'Should keep first entry');
});
