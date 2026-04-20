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
import {
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_INGRESS_STATE,
  MESSAGE_GROUP_LEADER_IDENTITY_SOURCE,
  MESSAGE_GROUP_LEADER_IDENTITY_STATE,
} from '../../src/message-group/message-group-forwarding-owner.js';
import {
  MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE,
  MESSAGE_GROUP_CDC_ERROR_MSG,
} from '../../src/message-group/constants.js';
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
import {
  RAFT_EVENT,
  RAFT_PACKET_TYPE,
} from '../../src/raft/constants.js';
import {LiferaftProvider} from '../../src/raft/liferaft-provider.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';

// Port counter for unique ports per test
let testPortCounter = 24000;

const TEST_SEMANTIC_LOCAL_LEADER_GROUP_ID =
  'mg-semantic-local-propose';
const TEST_SEMANTIC_LOCAL_LEADER_REPLICA_ID =
  'mg-semantic-local-propose-r1';
const TEST_SEMANTIC_LOCAL_LEADER_NODE_ID =
  'node-semantic-local-propose';
const TEST_SEMANTIC_LOCAL_LEADER_CAUSE_ID =
  'cause-semantic-local-propose';
const TEST_SEMANTIC_LOCAL_LEADER_TIMESTAMP =
  '1234567890:1:test-node';
const TEST_NON_SYSTEM_CDC_TABLE = 'runtime_forward_events';
const TEST_STALE_FORWARD_GROUP_ID = 'mg-stale-forward';
const TEST_STALE_FORWARD_LOCAL_REPLICA_ID = 'mg-stale-forward-r1';
const TEST_STALE_FORWARD_REMOTE_REPLICA_ID = 'mg-stale-forward-r2';
const TEST_STALE_FORWARD_REMOTE_ADDRESS =
  'remote-node/message-group/mg-stale-forward-r2';
const TEST_STALE_FORWARD_TIMESTAMP = '1234567890:77:test-node';
const TEST_CRITICAL_TRANSPORT_PARTITION_ADDRESS =
  'seed-node/partition/control_plane_publications-p1-r1';
const TEST_NON_CRITICAL_TRANSPORT_PARTITION_ADDRESS =
  'seed-node/partition/sql_write_operations-p1-r1';
const TEST_DELIVERY_PRIORITY = Object.freeze({
  BACKGROUND: 'background',
  CRITICAL: 'critical',
});
const TEST_RETRYABLE_FORWARD_RETRY_AFTER_MS = 11;
const TEST_RETRYABLE_FORWARD_ERROR_CODE = 'ROUTER_CONNECTION_CLOSED';
const TEST_RETRYABLE_FORWARD_ERROR_MSG =
  'Connection to node seed closed';
const TEST_RETRYABLE_FORWARD_GROUP_ID = 'mg-retryable-forward';
const TEST_RETRYABLE_FORWARD_REPLICA_ID = 'mg-retryable-forward-r2';
const TEST_RETRYABLE_FORWARD_NODE_RUNTIME_ID =
  'node-retryable-forward-r2';
const TEST_RETRYABLE_FORWARD_TARGET_SERVICE_ID =
  'mg-retryable-forward-r1';
const TEST_RETRYABLE_FORWARD_TARGET_ADDRESS =
  'seed-node/message-group/mg-retryable-forward-r1';
const TEST_RETRYABLE_FORWARD_ROW_NODE_ID = 'node-retryable-forward';
const TEST_RETRYABLE_FORWARD_PROPOSE_GROUP_ID =
  'mg-retryable-forward-propose';
const TEST_RETRYABLE_FORWARD_PROPOSE_REPLICA_ID =
  'mg-retryable-forward-propose-r2';
const TEST_RETRYABLE_FORWARD_PROPOSE_NODE_RUNTIME_ID =
  'node-retryable-forward-propose-r2';
const TEST_RETRYABLE_FORWARD_PROPOSE_ROW_NODE_ID =
  'node-retryable-forward-propose';
const TEST_RETRYABLE_FORWARD_PROPOSE_TIMESTAMP = '123';
const TEST_RETRYABLE_FORWARD_PROPOSE_CAUSE_ID =
  'cause-retryable-forward-propose';
const TEST_STRICT_RECOVERY_FORWARD_GROUP_ID =
  'mg-strict-recovery-forward';
const TEST_STRICT_RECOVERY_FORWARD_LOCAL_REPLICA_ID =
  'mg-strict-recovery-forward-r3';
const TEST_STRICT_RECOVERY_FORWARD_REMOTE_REPLICA_ID =
  'mg-strict-recovery-forward-r2';
const TEST_STRICT_RECOVERY_FORWARD_LEADER_REPLICA_ID =
  'mg-strict-recovery-forward-r1';
const TEST_STRICT_RECOVERY_FORWARD_LOCAL_NODE_ID =
  'node-strict-recovery-forward-local';
const TEST_STRICT_RECOVERY_FORWARD_REMOTE_NODE_ID =
  'node-strict-recovery-forward-remote';
const TEST_STRICT_RECOVERY_FORWARD_LEADER_NODE_ID =
  'node-strict-recovery-forward-leader';
const TEST_ADDRESSED_STRICT_CONVERGENCE_GROUP_ID =
  'mg-addressed-strict-forward-convergence';
const TEST_ADDRESSED_STRICT_CONVERGENCE_LOCAL_REPLICA_ID =
  'mg-addressed-strict-forward-convergence-r3';
const TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_REPLICA_ID =
  'mg-addressed-strict-forward-convergence-r1';
const TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_NODE_ID =
  'peer-node-addressed-strict-forward';
const TEST_ADDRESSED_STRICT_CONVERGENCE_REMOTE_ADDRESS =
  'peer-node-addressed-strict-forward/message-group/mg-addressed-strict-forward-convergence-r1';
const TEST_ADDRESSED_STRICT_CONVERGENCE_PARTITION_ID = 'partitions-p1';
const TEST_ADDRESSED_STRICT_CONVERGENCE_CAUSE_ID =
  'cause-addressed-strict-forward-convergence';
const TEST_ADDRESSED_STRICT_CONVERGENCE_TIMESTAMP =
  '1234567890:41:test-node';
const TEST_STRICT_RECOVERY_FORWARD_REMOTE_ADDRESS =
  'node-strict-recovery-forward-remote/message-group/mg-strict-recovery-forward-r2';
const TEST_STRICT_RECOVERY_ROUTING_STATE_LOCAL_ONLY = 'local_only';
const TEST_STRICT_RECOVERY_ROUTING_STATE_REMOTE_TARGETS =
  'remote_targets_available';
const TEST_RELAYED_STRICT_STALE_COMPETING_GROUP_ID =
  'mg-relayed-strict-stale-competing';
const TEST_RELAYED_STRICT_STALE_COMPETING_LOCAL_REPLICA_ID =
  'mg-relayed-strict-stale-competing-r1';
const TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_REPLICA_ID =
  'mg-relayed-strict-stale-competing-r2';
const TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_NODE_ID =
  'node-relayed-strict-stale-competing-remote';
const TEST_RELAYED_STRICT_STALE_COMPETING_REMOTE_ADDRESS =
  'node-relayed-strict-stale-competing-remote/message-group/' +
  'mg-relayed-strict-stale-competing-r2';
const TEST_RELAYED_STRICT_STALE_COMPETING_NODE_ROW_ID =
  'node-relayed-strict-stale-competing';
const TEST_SEMANTIC_LOCAL_LEADER_COMMAND = Object.freeze({
  type: 'CDC',
  tableName: TABLES.NODES,
  operation: CDC_OPERATION.UPDATE,
  data: Object.freeze({
    node_id: TEST_SEMANTIC_LOCAL_LEADER_NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
  }),
  timestamp: TEST_SEMANTIC_LOCAL_LEADER_TIMESTAMP,
  causeId: TEST_SEMANTIC_LOCAL_LEADER_CAUSE_ID,
});

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
    t.equal(
      service.raft?.state,
      LifeRaft.LEADER,
      'single-replica initialization should promote the live raft owner to leader immediately',
    );
    t.equal(
      service.isCurrentRaftLeader(),
      true,
      'single-replica initialization should expose live raft leadership through the shared owner path',
    );
    t.ok(leaderEvent, 'Should emit leaderElected event');

    await service.shutdown();
  } finally {
    await cleanup();
  }
});

test('MessageGroupService - single-replica initialization fails closed ' +
  'without raft change()', async (t) => {
  const {router, nodeId, cleanup} = await createTestTransport();
  try {
    const service = new MessageGroupService({
      groupId: 'mg-missing-change',
      replicaId: 'mg-missing-change-r1',
      nodeId,
      replicaIds: ['mg-missing-change-r1'],
      peerAddresses: [`${nodeId}/message-group/mg-missing-change-r1`],
      transport: router,
    });
    const originalReconcileRaftPeersFromCache =
      service.reconcileRaftPeersFromCache.bind(service);
    service.reconcileRaftPeersFromCache = function(...args) {
      const result = originalReconcileRaftPeersFromCache(...args);
      if (this.raft) {
        this.raft.change = undefined;
        this.raft.end = () => {};
      }
      return result;
    };

    await t.rejects(
      service.initialize(),
      /single-replica leadership requires raft\.change/,
      'single-replica initialization should fail instead of mutating leader state without the live raft owner',
    );

    await service.shutdown().catch(() => {});
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
