/**
 * Unit tests for MessageRouter.
 * Tests local and remote message routing.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */

import net from 'net';
import {EventEmitter} from 'events';
import t from '../../src/test-helpers/tap.js';
import {MessageRouter, ConnectionState, RouterMessageType} from
  '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {resolveRaftTransportDeliveryOptions} from
  '../../src/raft/constants.js';
import {registerMessageRouterTailTests} from './message-router-tail-test-cases.js';

/**
 * Initialize test environment.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 */
function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

t.test('MessageRouter unit tests chunk 3', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });
  t.test(
    'should keep reserve-protected pending capacity for large critical recovery sources',
    async (t) => {
      const TEST_LOCAL_NODE_ID = 'local-node';
      const TEST_REMOTE_NODE_ID = 'remote-node';
      const TEST_NODE_ADDRESS = 'ws://local-node:7000';
      const TEST_MAX_CONCURRENT = 1;
      const TEST_MAX_PENDING = 64;
      const TEST_CRITICAL_RESERVE = 16;
      const TEST_ALLOWED_HOT_SOURCE_DELIVERIES = 48;
      const TEST_PENDING_SOURCE_LIMIT = 48;
      const TEST_UNRELATED_PENDING_DELIVERIES = 1;
      const TEST_HOT_RECOVERY_TARGET_ADDRESS =
        'remote-node/partition/control_plane_publications-p1-r1';
      const TEST_CONTROL_PLANE_TARGET_ADDRESS =
        'remote-node/service/control-plane';
      const router = new MessageRouter({
        nodeId: TEST_LOCAL_NODE_ID,
        nodeAddress: TEST_NODE_ADDRESS,
        startServer: false,
        outboundQueueMaxConcurrent: TEST_MAX_CONCURRENT,
        outboundQueueMaxPending: TEST_MAX_PENDING,
        outboundQueueCriticalReserve: TEST_CRITICAL_RESERVE,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const criticalSourceDeliveries = [];
      for (
        let index = 0;
        index < TEST_ALLOWED_HOT_SOURCE_DELIVERIES;
        index++
      ) {
        criticalSourceDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            async () => ({acknowledged: true, criticalIndex: index}),
            {
              deliveryPriority: 'critical',
              targetAddress: TEST_HOT_RECOVERY_TARGET_ADDRESS,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const unrelatedCriticalDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        async () => ({acknowledged: true, unrelated: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: TEST_REMOTE_NODE_ID,
            heartbeat_only: true,
          },
        },
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.pending.filter((item) =>
          item?.deliverySource ===
          `target:${TEST_HOT_RECOVERY_TARGET_ADDRESS}`).length,
        TEST_ALLOWED_HOT_SOURCE_DELIVERIES,
        'large critical recovery source should stop at the reserve-protected source cap',
      );
      t.equal(
        queue.pending.length,
        TEST_ALLOWED_HOT_SOURCE_DELIVERIES +
          TEST_UNRELATED_PENDING_DELIVERIES,
        'unrelated critical traffic should still keep one reserved pending slot',
      );
      await t.rejects(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          async () => ({acknowledged: true, overflow: true}),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_HOT_RECOVERY_TARGET_ADDRESS,
            message: {},
          },
        ),
        /queue/i,
        'large critical recovery source should be rejected once it reaches the reserve-protected source cap',
      );

      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery' &&
        entry.context?.backpressureScope === 'delivery_source');
      t.ok(
        saturationEntry,
        'router should emit one delivery-source saturation warning for the capped critical source',
      );
      t.equal(
        saturationEntry?.context?.attemptedDeliverySource,
        `target:${TEST_HOT_RECOVERY_TARGET_ADDRESS}`,
        'warning should attribute the capped large critical recovery source',
      );
      t.equal(
        saturationEntry?.context?.pendingForSource,
        TEST_PENDING_SOURCE_LIMIT,
        'warning should report the queued count at the reserve-protected cap',
      );
      t.equal(
        saturationEntry?.context?.pendingSourceLimit,
        TEST_PENDING_SOURCE_LIMIT,
        'warning should report the reserve-protected critical source cap',
      );
      t.equal(
        saturationEntry?.context?.sourceLimitApplied,
        true,
        'large critical recovery source should still participate in source-capped admission',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(criticalSourceDeliveries);
      await unrelatedCriticalDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should rotate critical dispatch to a waiting source when one source is hot',
    async (t) => {
      const TEST_LOCAL_NODE_ID = 'local-node';
      const TEST_REMOTE_NODE_ID = 'remote-node';
      const TEST_NODE_ADDRESS = 'ws://local-node:7000';
      const TEST_MAX_CONCURRENT = 1;
      const TEST_MAX_PENDING = 8;
      const TEST_CRITICAL_RESERVE = 4;
      const TEST_HOT_TARGET_ADDRESS =
        'remote-node/partition/sql_transaction_participants-p1-r4';
      const TEST_CONTROL_PLANE_TARGET_ADDRESS =
        'remote-node/service/control-plane';
      const TEST_HOT_INITIAL_LABEL = 'hot-0';
      const TEST_HOT_PENDING_LABEL = 'hot-1';
      const TEST_CONTROL_PLANE_LABEL = 'control-plane';
      const router = new MessageRouter({
        nodeId: TEST_LOCAL_NODE_ID,
        nodeAddress: TEST_NODE_ADDRESS,
        startServer: false,
        outboundQueueMaxConcurrent: TEST_MAX_CONCURRENT,
        outboundQueueMaxPending: TEST_MAX_PENDING,
        outboundQueueCriticalReserve: TEST_CRITICAL_RESERVE,
      });
      await router.initialize();

      const startedDeliveries = [];
      let releaseFirstSend = null;
      let releaseHotPending = null;
      let releaseControlPlane = null;
      const firstDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          startedDeliveries.push(TEST_HOT_INITIAL_LABEL);
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {
          deliveryPriority: 'critical',
          targetAddress: TEST_HOT_TARGET_ADDRESS,
          message: {},
        },
      );
      await Promise.resolve();

      const hotPendingDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          startedDeliveries.push(TEST_HOT_PENDING_LABEL);
          releaseHotPending = () => resolve({acknowledged: true});
        }),
        {
          deliveryPriority: 'critical',
          targetAddress: TEST_HOT_TARGET_ADDRESS,
          message: {},
        },
      );
      await Promise.resolve();

      const controlPlaneDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          startedDeliveries.push(TEST_CONTROL_PLANE_LABEL);
          releaseControlPlane = () => resolve({acknowledged: true});
        }),
        {
          deliveryPriority: 'critical',
          targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: TEST_REMOTE_NODE_ID,
            heartbeat_only: true,
          },
        },
      );
      await Promise.resolve();

      releaseFirstSend();
      await firstDelivery;
      await Promise.resolve();

      t.same(
        startedDeliveries,
        [TEST_HOT_INITIAL_LABEL, TEST_CONTROL_PLANE_LABEL],
        'the next critical dispatch should prefer a waiting source instead of repeating the hot source',
      );

      releaseControlPlane();
      await controlPlaneDelivery;
      await Promise.resolve();

      t.same(
        startedDeliveries,
        [
          TEST_HOT_INITIAL_LABEL,
          TEST_CONTROL_PLANE_LABEL,
          TEST_HOT_PENDING_LABEL,
        ],
        'the hot source should resume once the waiting source gets one dispatch turn',
      );

      releaseHotPending();
      await hotPendingDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should classify wrapped query payloads by nested payload semantics',
    async (t) => {
      const WRAPPED_QUERY_TARGET_ADDRESS =
        'remote-node/partition/control_plane_publications-p1-r4';
      const WRAPPED_QUERY_DELIVERY_SOURCE =
        'query:insert:control_plane_publications';
      const WRAPPED_QUERY_MESSAGE = {
        payload: {
          type: 'QUERY',
          sql:
            'INSERT INTO control_plane_publications ' +
            '(publication_id) VALUES (?)',
          params: ['pub-1'],
        },
      };
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const wrappedQueryDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: WRAPPED_QUERY_TARGET_ADDRESS,
          message: WRAPPED_QUERY_MESSAGE,
        },
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending[0]?.deliverySource,
        WRAPPED_QUERY_DELIVERY_SOURCE,
        'wrapped query payloads should classify by the nested query payload ' +
          'instead of the raw target address',
      );

      releaseFirstSend();
      await firstDelivery;
      await wrappedQueryDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should classify typeless CDC payloads by table and operation semantics',
    async (t) => {
      const TYPELESS_CDC_TARGET_ADDRESS =
        'remote-node/partition/sql_transactions-p1-r4';
      const TYPELESS_CDC_DELIVERY_SOURCE = 'cdc:upsert:sql_transactions';
      const TYPELESS_CDC_MESSAGE = {
        tableName: 'sql_transactions',
        operation: 'UPSERT',
        data: {transaction_id: 'txn-1'},
      };
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const typelessCdcDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: TYPELESS_CDC_TARGET_ADDRESS,
          message: TYPELESS_CDC_MESSAGE,
        },
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending[0]?.deliverySource,
        TYPELESS_CDC_DELIVERY_SOURCE,
        'typeless CDC payloads should classify by table and operation ' +
          'instead of collapsing to the replica target address',
      );

      releaseFirstSend();
      await firstDelivery;
      await typelessCdcDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should preserve explicit heartbeat queue semantics from raft transport ' +
      'options when the queued payload is typeless',
    async (t) => {
      const HEARTBEAT_TARGET_ADDRESS =
        'remote-node/partition/sql_transactions-p1-r4';
      const HEARTBEAT_TRANSPORT_OPTIONS = resolveRaftTransportDeliveryOptions({
        type: 'append',
        data: [],
        targetAddress: HEARTBEAT_TARGET_ADDRESS,
      });
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const deliveredHeartbeatIds = [];
      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const secondDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatIds.push('second');
          return {acknowledged: true, heartbeatId: 'second'};
        },
        {
          ...HEARTBEAT_TRANSPORT_OPTIONS,
          targetAddress: HEARTBEAT_TARGET_ADDRESS,
          message: {},
        },
      );
      const thirdDelivery = router.enqueueOutbound(
        'remote-node',
        async () => {
          deliveredHeartbeatIds.push('third');
          return {acknowledged: true, heartbeatId: 'third'};
        },
        {
          ...HEARTBEAT_TRANSPORT_OPTIONS,
          targetAddress: HEARTBEAT_TARGET_ADDRESS,
          message: {},
        },
      );
      await Promise.resolve();

      const supersededResult = await secondDelivery;
      t.equal(
        supersededResult?.result?.acknowledged,
        true,
        'superseded heartbeat should still resolve successfully',
      );
      t.equal(
        supersededResult?.result?.replacedPending,
        true,
        'explicit heartbeat replace keys should coalesce typeless queued work',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        1,
        'helper-owned heartbeat semantics should keep only one pending heartbeat',
      );
      t.equal(
        queue.pending[0]?.deliverySource,
        'raft:append:heartbeat',
        'queued heartbeat should keep the canonical heartbeat delivery source',
      );

      releaseFirstSend();
      await firstDelivery;
      const finalHeartbeatResult = await thirdDelivery;

      t.same(
        deliveredHeartbeatIds,
        ['third'],
        'only the latest queued heartbeat should drain after coalescing',
      );
      t.equal(
        finalHeartbeatResult?.result?.heartbeatId,
        'third',
        'the latest queued heartbeat should be the delivered result',
      );

      await router.shutdown();
    },
  );

  await registerMessageRouterTailTests({
    t,
    net,
    EventEmitter,
    MessageRouter,
    ConnectionState,
    RouterMessageType,
    ConfigurationManager,
    LoggingService,
    initializeTestEnvironment,
    cleanupTestEnvironment,
  });
});
