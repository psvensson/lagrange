/**
 * Regression test: message group failover preserves CDC continuity.
 *
 * Validates that when a message group leader fails over (old leader steps
 * down, new leader elected), the new leader re-establishes CDC subscriptions
 * for all previously subscribed tables via the existing subscribeToCDC path.
 *
 * Uses wireReplicaLifecycleEvents → onLeader → CDCHandler re-subscription
 * path in MessageGroupService (main thread).
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  MessageGroupService,
} from '../../src/message-group/message-group-service.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  ConfigurationManager,
} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {RAFT_EVENT} from '../../src/raft/constants.js';
import {
  MESSAGE_GROUP_SERVICE_LOG_MSG,
} from '../../src/message-group/constants.js';
import {NUM} from '../../src/constants/index.js';

// Test-local constants for fixture values.
const TEST_PORT_BASE = 25200;
let testPortCounter = TEST_PORT_BASE;
const TEST_GROUP_ID = 'mg-failover-cdc';
const TEST_NODE_ID_PREFIX = 'failover-node-';
const CDC_TABLE_NODES = 'nodes';
const CDC_TABLE_PARTITIONS = 'partitions';
const CDC_TABLE_SERVICES = 'services';

/**
 * Create a real WebSocket transport for testing.
 * Follows the same pattern as message-group-service.test.js.
 * @return {Promise<{router: MessageRouter, nodeId: string, cleanup: Function}>}
 */
async function createTestTransport() {
  const port = testPortCounter++;
  const nodeId = `${TEST_NODE_ID_PREFIX}${port}`;
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

test(
  'MessageGroupService - new leader re-subscribes to all CDC tables ' +
  'on leadership gain after failover ' +
  '(uses wireRaftEvents → onLeader → subscribeToCDC owner path)',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const replicaId = `${TEST_GROUP_ID}-r1`;
      const service = new MessageGroupService({
        groupId: TEST_GROUP_ID,
        replicaId,
        nodeId,
        transport: router,
      });

      await service.initialize();

      // Subscribe to CDC tables while leader (single-replica starts
      // as leader).
      await service.subscribeToCDC(CDC_TABLE_NODES);
      await service.subscribeToCDC(CDC_TABLE_PARTITIONS);
      await service.subscribeToCDC(CDC_TABLE_SERVICES);

      const initialSubs = service.cdcHandler.getSubscriptions();
      t.equal(
        initialSubs.length,
        NUM.THREE,
        'should have three CDC subscriptions before failover',
      );

      // Track subscribeToCDC calls during re-subscription.
      const resubscribedTables = [];
      const originalSubscribeToCDC =
        service.subscribeToCDC.bind(service);
      service.subscribeToCDC = async (tableName) => {
        resubscribedTables.push(tableName);
        return originalSubscribeToCDC(tableName);
      };

      // Simulate leadership loss: emit FOLLOWER event.
      service.raft.emit(RAFT_EVENT.FOLLOWER);
      t.equal(
        service.isLeader,
        false,
        'should lose leadership after FOLLOWER event',
      );

      // Simulate leadership gain: emit LEADER event.
      // This triggers wireRaftEvents → onLeader → CDC re-subscription.
      service.raft.emit(RAFT_EVENT.LEADER);
      t.equal(
        service.isLeader,
        true,
        'should regain leadership after LEADER event',
      );

      // Assert re-subscription happened for all three tables.
      t.equal(
        resubscribedTables.length,
        NUM.THREE,
        'should re-subscribe to all CDC tables on leadership gain',
      );
      t.ok(
        resubscribedTables.includes(CDC_TABLE_NODES),
        'should re-subscribe to nodes table',
      );
      t.ok(
        resubscribedTables.includes(CDC_TABLE_PARTITIONS),
        'should re-subscribe to partitions table',
      );
      t.ok(
        resubscribedTables.includes(CDC_TABLE_SERVICES),
        'should re-subscribe to services table',
      );

      // Verify subscriptions are still active after failover.
      const postFailoverSubs = service.cdcHandler.getSubscriptions();
      t.equal(
        postFailoverSubs.length,
        NUM.THREE,
        'all CDC subscriptions should remain active after failover',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - CDC re-subscription on leadership gain is ' +
  'idempotent (CDCHandler.subscribe is safe to call repeatedly)',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const replicaId = `${TEST_GROUP_ID}-idempotent-r1`;
      const service = new MessageGroupService({
        groupId: `${TEST_GROUP_ID}-idempotent`,
        replicaId,
        nodeId,
        transport: router,
      });

      await service.initialize();

      // Subscribe to a CDC table.
      await service.subscribeToCDC(CDC_TABLE_NODES);

      // Trigger multiple leadership transitions.
      service.raft.emit(RAFT_EVENT.FOLLOWER);
      service.raft.emit(RAFT_EVENT.LEADER);
      service.raft.emit(RAFT_EVENT.FOLLOWER);
      service.raft.emit(RAFT_EVENT.LEADER);

      // Subscriptions should still be exactly one entry (idempotent).
      const subs = service.cdcHandler.getSubscriptions();
      t.equal(
        subs.length,
        NUM.ONE,
        'repeated re-subscription should not duplicate entries',
      );
      t.ok(
        subs.includes(CDC_TABLE_NODES),
        'nodes subscription should persist through multiple failovers',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - no CDC re-subscription when no tables were ' +
  'subscribed before failover',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const replicaId = `${TEST_GROUP_ID}-empty-r1`;
      const service = new MessageGroupService({
        groupId: `${TEST_GROUP_ID}-empty`,
        replicaId,
        nodeId,
        transport: router,
      });

      await service.initialize();

      // No CDC subscriptions registered.
      t.equal(
        service.cdcHandler.getSubscriptions().length,
        NUM.ZERO,
        'should have no subscriptions initially',
      );

      // Track subscribeToCDC calls.
      let subscribeCalls = NUM.ZERO;
      const originalSubscribeToCDC =
        service.subscribeToCDC.bind(service);
      service.subscribeToCDC = async (tableName) => {
        subscribeCalls++;
        return originalSubscribeToCDC(tableName);
      };

      // Simulate failover with no prior subscriptions.
      service.raft.emit(RAFT_EVENT.FOLLOWER);
      service.raft.emit(RAFT_EVENT.LEADER);

      t.equal(
        subscribeCalls,
        NUM.ZERO,
        'should not call subscribeToCDC when no tables were subscribed',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - failover does not require manual intervention ' +
  'to restore CDC propagation (automatic re-subscription on LEADER event)',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const replicaId = `${TEST_GROUP_ID}-auto-r1`;
      const service = new MessageGroupService({
        groupId: `${TEST_GROUP_ID}-auto`,
        replicaId,
        nodeId,
        transport: router,
      });

      await service.initialize();

      // Subscribe to CDC tables.
      await service.subscribeToCDC(CDC_TABLE_NODES);
      await service.subscribeToCDC(CDC_TABLE_SERVICES);

      // Capture log messages to verify re-subscription logging.
      const logMessages = [];
      const originalInfo = service.logger.info.bind(service.logger);
      service.logger.info = (msg, fields) => {
        logMessages.push({msg, fields});
        return originalInfo(msg, fields);
      };

      // Simulate full failover cycle: lose leadership, then regain.
      service.raft.emit(RAFT_EVENT.FOLLOWER);
      service.raft.emit(RAFT_EVENT.LEADER);

      // Verify re-subscription log was emitted (proves automatic
      // recovery without manual intervention).
      const resubscribeLog = logMessages.find(
        (entry) => entry.msg ===
          MESSAGE_GROUP_SERVICE_LOG_MSG.CDC_RESUBSCRIBE_ON_LEADER,
      );
      t.ok(
        resubscribeLog,
        'should log CDC re-subscription on leadership gain',
      );
      t.equal(
        resubscribeLog?.fields?.tableCount,
        NUM.TWO,
        'log should report correct table count',
      );

      const completeLog = logMessages.find(
        (entry) => entry.msg ===
          MESSAGE_GROUP_SERVICE_LOG_MSG
            .CDC_RESUBSCRIBE_ON_LEADER_COMPLETE,
      );
      t.ok(
        completeLog,
        'should log CDC re-subscription completion',
      );

      // Verify CDC handler still has active subscriptions.
      t.ok(
        service.cdcHandler.isSubscribed(CDC_TABLE_NODES),
        'nodes subscription should be active after automatic recovery',
      );
      t.ok(
        service.cdcHandler.isSubscribed(CDC_TABLE_SERVICES),
        'services subscription should be active after automatic recovery',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService - CDC events applied after failover reach the ' +
  'system cache (end-to-end continuity)',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const replicaId = `${TEST_GROUP_ID}-e2e-r1`;
      const service = new MessageGroupService({
        groupId: `${TEST_GROUP_ID}-e2e`,
        replicaId,
        nodeId,
        transport: router,
      });

      await service.initialize();

      // Subscribe to CDC and apply an event before failover.
      await service.subscribeToCDC(CDC_TABLE_NODES);
      await service.applyCDCEvent(CDC_TABLE_NODES, 'INSERT', {
        id: 'node-before-failover',
        status: 'active',
      });

      const preFail = service.getWritableCache()
        .get(CDC_TABLE_NODES, 'node-before-failover');
      t.ok(preFail, 'event before failover should be in cache');

      // Simulate failover.
      service.raft.emit(RAFT_EVENT.FOLLOWER);
      service.raft.emit(RAFT_EVENT.LEADER);

      // Apply a CDC event after failover — this proves the new leader's
      // CDC pipeline is functional without manual intervention.
      await service.applyCDCEvent(CDC_TABLE_NODES, 'INSERT', {
        id: 'node-after-failover',
        status: 'active',
      });

      const postFail = service.getWritableCache()
        .get(CDC_TABLE_NODES, 'node-after-failover');
      t.ok(
        postFail,
        'event after failover should reach system cache ' +
        '(proves CDC continuity)',
      );
      t.equal(
        postFail.status,
        'active',
        'post-failover cache entry should have correct data',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);
