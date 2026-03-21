/**
 * Regression test: MessageGroupService (non-worker) re-subscribes to
 * all CDC-propagated tables on Raft leadership gain.
 *
 * This is a focused test that verifies the onLeader callback in
 * wireRaftEvents iterates cdcHandler.getSubscriptions() and calls
 * subscribeToCDC for each table when leadership is gained.
 *
 * Uses wireReplicaLifecycleEvents → onLeader → subscribeToCDC owner path.
 *
 * Validates: Requirements 6.1, 6.2
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
  CACHE_HYDRATION_TABLES,
} from '../../src/cache/cache-constants.js';
import {NUM} from '../../src/constants/index.js';

// Test-local fixture constants.
const TEST_PORT_BASE = 25300;
let testPortCounter = TEST_PORT_BASE;
const TEST_GROUP_ID = 'mg-leader-cdc';
const TEST_NODE_ID_PREFIX = 'leader-cdc-node-';

function createImmediateLeaderActivationScheduler() {
  return {
    enqueue: (run) => {
      run();
      return {cancel: () => {}};
    },
  };
}

/**
 * Create a real WebSocket transport for testing.
 * Follows the same pattern as message-group-failover-cdc-continuity.test.js.
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
  'MessageGroupService re-subscribes to all CDC-propagated tables ' +
  'on leadership gain ' +
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
        leaderActivationStabilizationMs: NUM.ZERO,
        leaderActivationNodeSpacingMs: NUM.ZERO,
        leaderActivationScheduler: createImmediateLeaderActivationScheduler(),
      });

      await service.initialize();

      // Subscribe to ALL CDC-propagated tables while leader
      // (single-replica group starts as leader).
      for (const tableName of CACHE_HYDRATION_TABLES) {
        await service.subscribeToCDC(tableName);
      }

      const initialSubs = service.cdcHandler.getSubscriptions();
      t.equal(
        initialSubs.length,
        CACHE_HYDRATION_TABLES.length,
        'should have all CDC-propagated table subscriptions',
      );

      // Track subscribeToCDC calls during re-subscription.
      const resubscribedTables = [];
      const originalSubscribeToCDC =
        service.subscribeToCDC.bind(service);
      service.subscribeToCDC = async (tableName) => {
        resubscribedTables.push(tableName);
        return originalSubscribeToCDC(tableName);
      };

      // Simulate leadership loss then gain.
      service.raft.emit(RAFT_EVENT.FOLLOWER);
      service.raft.emit(RAFT_EVENT.LEADER);

      // Assert subscribeToCDC called for EACH CDC-propagated table.
      t.equal(
        resubscribedTables.length,
        CACHE_HYDRATION_TABLES.length,
        'should re-subscribe to every CDC-propagated table',
      );

      for (const tableName of CACHE_HYDRATION_TABLES) {
        t.ok(
          resubscribedTables.includes(tableName),
          `should re-subscribe to ${tableName}`,
        );
      }

      // Verify subscription count matches CDC-propagated tables.
      const postSubs = service.cdcHandler.getSubscriptions();
      t.equal(
        postSubs.length,
        CACHE_HYDRATION_TABLES.length,
        'subscription count should match CDC-propagated table count',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);

test(
  'MessageGroupService subscribeToCDC count matches ' +
  'CDC-propagated tables length after leadership gain',
  async (t) => {
    const {router, nodeId, cleanup} = await createTestTransport();
    try {
      const replicaId = `${TEST_GROUP_ID}-count-r1`;
      const service = new MessageGroupService({
        groupId: `${TEST_GROUP_ID}-count`,
        replicaId,
        nodeId,
        transport: router,
        leaderActivationStabilizationMs: NUM.ZERO,
        leaderActivationNodeSpacingMs: NUM.ZERO,
        leaderActivationScheduler: createImmediateLeaderActivationScheduler(),
      });

      await service.initialize();

      // Subscribe to all CDC-propagated tables.
      for (const tableName of CACHE_HYDRATION_TABLES) {
        await service.subscribeToCDC(tableName);
      }

      // Count re-subscription calls on leadership gain.
      let resubscribeCount = NUM.ZERO;
      const originalSubscribeToCDC =
        service.subscribeToCDC.bind(service);
      service.subscribeToCDC = async (tableName) => {
        resubscribeCount++;
        return originalSubscribeToCDC(tableName);
      };

      service.raft.emit(RAFT_EVENT.FOLLOWER);
      service.raft.emit(RAFT_EVENT.LEADER);

      // The count of re-subscribe calls must exactly equal the
      // number of CDC-propagated tables — no more, no fewer.
      t.equal(
        resubscribeCount,
        CACHE_HYDRATION_TABLES.length,
        're-subscribe call count should equal ' +
        'CDC-propagated table count exactly',
      );

      await service.shutdown();
    } finally {
      await cleanup();
    }
  },
);
