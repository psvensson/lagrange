/**
 * Unit tests for MessageRouter.
 * Tests local and remote message routing.
 * Requirements: 4.21, 4.22, 11.6, 11.7, 11.8, 11.9
 */

import t from '../../src/test-helpers/tap.js';
import {
  MessageRouter,
  ConnectionState,
} from '../../src/transport/message-router.js';
import {
  countCriticalPendingByAdmissionSource,
  resolveDeliverySourceAdmissionKey,
} from '../../src/transport/message-router-delivery-source-admission.js';
import {
  selectCriticalPendingSourcePreemptionCandidateIndex,
} from '../../src/transport/message-router-shared-stage-2.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
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

t.test('MessageRouter unit tests chunk 2', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
  });

  t.afterEach(() => {
    cleanupTestEnvironment();
  });
  t.test('should reserve pending capacity for critical outbound deliveries',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 3,
      });
      await router.initialize();

      let sendCallCount = 0;
      let releaseFirstSend = null;
      router.registerPendingResponse = () => new Promise(() => {});
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
        configuredAddress: 'ws://remote-node:9999',
        observedAddress: null,
        state: ConnectionState.CONNECTED,
        ws: {},
        isIncoming: false,
      });
      router.sendMessage = async () => {
        sendCallCount += 1;
        if (sendCallCount === 1) {
          await new Promise((resolve) => {
            releaseFirstSend = resolve;
          });
        }
        return {
          acknowledged: false,
          error: 'released-send',
        };
      };

      const inFlightDelivery = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-1'},
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      const backgroundQueued = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-2'},
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      const backgroundRejectedAttempt = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-3'},
        {deliveryPriority: 'background'},
      );
      const backgroundRejected = await Promise.race([
        backgroundRejectedAttempt,
        new Promise((resolve) => setImmediate(() => resolve('pending'))),
      ]);
      t.equal(
        backgroundRejected !== 'pending',
        true,
        'background rejection should fail fast instead of waiting in the queue',
      );
      t.equal(
        backgroundRejected.acknowledged,
        false,
        'background delivery should be rejected once non-reserved capacity is full',
      );
      t.match(
        backgroundRejected.error,
        /queue/i,
        'background rejection should surface queue pressure',
      );

      const criticalQueued = router.deliver(
        'remote-node/service/remote-service',
        {type: 'TEST_MESSAGE', messageId: 'msg-4'},
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        1,
        'background delivery should remain queued while critical work borrows reserve',
      );
      t.equal(
        queue.inFlightCriticalSourceReserve,
        1,
        'critical delivery should borrow one reserve dispatch slot',
      );

      releaseFirstSend();
      await inFlightDelivery;
      await backgroundQueued;
      await criticalQueued;
      await router.shutdown();
    });

  t.test('should reserve in-flight dispatch capacity for critical outbound deliveries',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 2,
        outboundQueueMaxPending: 4,
        outboundQueueCriticalReserve: 1,
      });
      await router.initialize();

      let releaseFirstBackground = null;
      let releaseSecondBackground = null;
      const startedDeliveries = [];
      const firstBackground = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          startedDeliveries.push('background-1');
          releaseFirstBackground = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      const secondBackground = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          startedDeliveries.push('background-2');
          releaseSecondBackground = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'background'},
      );
      await Promise.resolve();

      let criticalStarted = false;
      let releaseCritical = null;
      const criticalDelivery = router.enqueueOutbound(
        'remote-node',
        () => new Promise((resolve) => {
          criticalStarted = true;
          startedDeliveries.push('critical');
          releaseCritical = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.inFlight,
        2,
        'one background and one critical delivery should occupy the dispatch slots',
      );
      t.equal(
        queue.pending.length,
        1,
        'second background delivery should remain queued behind the reserved critical slot',
      );
      t.equal(
        criticalStarted,
        true,
        'critical delivery should start without waiting for the queued background work',
      );
      t.same(
        startedDeliveries,
        ['background-1', 'critical'],
        'router should dispatch the critical delivery before the second background delivery',
      );

      releaseFirstBackground();
      await firstBackground;
      await Promise.resolve();

      t.same(
        startedDeliveries,
        ['background-1', 'critical', 'background-2'],
        'queued background delivery should resume once dispatch capacity is available',
      );

      releaseCritical();
      await criticalDelivery;
      releaseSecondBackground();
      await secondBackground;
      await router.shutdown();
    });

  t.test(
    'should reserve one critical in-flight slot for a different delivery source',
    async (t) => {
      const TEST_LOCAL_NODE_ID = 'local-node';
      const TEST_REMOTE_NODE_ID = 'remote-node';
      const TEST_NODE_ADDRESS = 'ws://local-node:7000';
      const TEST_MAX_CONCURRENT = 2;
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
      let releaseFirstHot = null;
      let releasePendingHot = null;
      let releaseControlPlane = null;
      const firstHotDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          startedDeliveries.push(TEST_HOT_INITIAL_LABEL);
          releaseFirstHot = () => resolve({acknowledged: true});
        }),
        {
          deliveryPriority: 'critical',
          targetAddress: TEST_HOT_TARGET_ADDRESS,
          message: {},
        },
      );
      await Promise.resolve();

      const pendingHotDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          startedDeliveries.push(TEST_HOT_PENDING_LABEL);
          releasePendingHot = () => resolve({acknowledged: true});
        }),
        {
          deliveryPriority: 'critical',
          targetAddress: TEST_HOT_TARGET_ADDRESS,
          message: {},
        },
      );
      await Promise.resolve();

      t.same(
        startedDeliveries,
        [TEST_HOT_INITIAL_LABEL],
        'the hot source should leave one critical in-flight slot unused while no other source is ready',
      );

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

      t.same(
        startedDeliveries,
        [TEST_HOT_INITIAL_LABEL, TEST_CONTROL_PLANE_LABEL],
        'the reserved critical slot should dispatch a different source immediately',
      );

      releaseFirstHot();
      await firstHotDelivery;
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
        'the hot source should resume once the other critical source finishes',
      );

      releasePendingHot();
      await pendingHotDelivery;
      await router.shutdown();
    },
  );

  t.test('should attribute saturated queue warnings to delivery sources',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 1,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const blockingDeliverFn = async () => {
        await new Promise((resolve) => {
          releaseFirstSend = resolve;
        });
        return {acknowledged: true};
      };

      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        blockingDeliverFn,
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const secondDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/partition/services-p1-r1',
          message: {
            type: 'QUERY',
            messageId: 'msg-2',
            sql: 'UPDATE services SET raft_role = ? WHERE service_id = ?',
            params: ['leader', 'svc-1'],
          },
        },
      );
      await Promise.resolve();

      let rejectionError = null;
      try {
        await router.enqueueOutbound(
          'remote-node',
          async () => ({acknowledged: true}),
          {
            deliveryPriority: 'critical',
            targetAddress: 'remote-node/service/control-plane',
            message: {type: 'NODE_STATE_UPDATE', messageId: 'msg-3'},
            deliverySource: 'join:node_state_update',
          },
        );
      } catch (error) {
        rejectionError = error;
      }

      t.ok(rejectionError, 'saturated delivery should fail');
      t.equal(
        rejectionError?.code,
        'ROUTER_OUTBOUND_QUEUE_BACKPRESSURED',
        'rejected delivery should surface queue backpressure',
      );
      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery');
      t.ok(saturationEntry, 'router should emit one saturation warning');
      t.equal(
        saturationEntry.context.localNodeId,
        'test-node',
        'warning should retain the local node id',
      );
      t.equal(
        saturationEntry.context.targetNodeId,
        'remote-node',
        'warning should report the target node id',
      );
      t.equal(
        saturationEntry.context.attemptedDeliverySource,
        'join:node_state_update',
        'warning should attribute the rejected source',
      );
      t.same(
        saturationEntry.context.pendingSourceSummary,
        [
          {source: 'query:update:services', count: 1},
        ],
        'warning should summarize the queued source mix',
      );

      releaseFirstSend();
      await firstDelivery;
      await secondDelivery;
      await router.shutdown();
    });

  t.test('should attribute Raft append saturation to underlying command types',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 1,
        outboundQueueCriticalReserve: 0,
      });
      await router.initialize();

      const warnEntries = [];
      const originalWarn = router.logger.warn.bind(router.logger);
      router.logger.warn = (message, context) => {
        warnEntries.push({message, context});
        return originalWarn(message, context);
      };

      let releaseFirstSend = null;
      const blockingDeliverFn = async () => {
        await new Promise((resolve) => {
          releaseFirstSend = resolve;
        });
        return {acknowledged: true};
      };

      const firstDelivery = router.enqueueOutbound(
        'remote-node',
        blockingDeliverFn,
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const secondDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/message-group/mg-1-r2',
          message: {
            type: 'append',
            data: [
              {
                command: {
                  type: 'CDC_BATCH',
                  events: [
                    {
                      tableName: 'services',
                      operation: 'UPDATE',
                      data: {service_id: 'svc-1'},
                    },
                    {
                      tableName: 'services',
                      operation: 'UPDATE',
                      data: {service_id: 'svc-2'},
                    },
                  ],
                },
              },
            ],
          },
        },
      );
      await Promise.resolve();

      await t.rejects(
        router.enqueueOutbound(
          'remote-node',
          async () => ({acknowledged: true}),
          {
            deliveryPriority: 'critical',
            targetAddress: 'remote-node/message-group/mg-1-r3',
            message: {
              type: 'append',
              data: [
                {
                  command: {
                    type: 'MESSAGE',
                    message: {
                      payload: {
                        type: 'NODE_STATE_UPDATE',
                      },
                    },
                  },
                },
              ],
            },
          },
        ),
        /queue/i,
        'third delivery should surface queue saturation',
      );

      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery');
      t.ok(saturationEntry, 'router should emit one saturation warning');
      t.equal(
        saturationEntry.context.attemptedDeliverySource,
        'raft:append:message:node_state_update',
        'warning should attribute rejected raft append by logical command type',
      );
      t.same(
        saturationEntry.context.pendingSourceSummary,
        [
          {source: 'raft:append:cdc_batch:services:2', count: 1},
        ],
        'warning should summarize queued raft append command types',
      );

      releaseFirstSend();
      await firstDelivery;
      await secondDelivery;
      await router.shutdown();
    });

  t.test(
    'should keep one background delivery source from monopolizing the pending queue',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'test-node',
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 8,
        outboundQueueCriticalReserve: 0,
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
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const hotTargetAddress =
        'remote-node/partition/sql_transaction_participants-p1-r4';
      const hotSourceDeliveries = [];
      for (let index = 0; index < 4; index++) {
        hotSourceDeliveries.push(
          router.enqueueOutbound(
            'remote-node',
            async () => ({acknowledged: true, hotIndex: index}),
            {
              deliveryPriority: 'background',
              targetAddress: hotTargetAddress,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const unrelatedDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true, controlPlane: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/service/control-plane',
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: 'remote-node',
            heartbeat_only: true,
          },
        },
      );
      await Promise.resolve();

      await t.rejects(
        router.enqueueOutbound(
          'remote-node',
          async () => ({acknowledged: true}),
          {
            deliveryPriority: 'background',
            targetAddress: hotTargetAddress,
            message: {},
          },
        ),
        /queue/i,
        'same-source saturation should reject additional deliveries before the node queue is full',
      );

      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery' &&
        entry.context?.backpressureScope === 'delivery_source');
      t.ok(
        saturationEntry,
        'router should emit one delivery-source saturation warning',
      );
      t.equal(
        saturationEntry?.context?.attemptedDeliverySource,
        `target:${hotTargetAddress}`,
        'warning should attribute the saturated delivery source',
      );
      t.equal(
        saturationEntry?.context?.pendingForSource,
        4,
        'warning should report the queued count for the saturated source',
      );
      t.equal(
        saturationEntry?.context?.pendingSourceLimit,
        4,
        'warning should report the bounded queued limit for one source',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        5,
        'unrelated traffic should still keep one slot when a hot source reaches its cap',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(hotSourceDeliveries);
      await unrelatedDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should keep one critical recovery source from monopolizing the pending queue',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'local-node',
        nodeAddress: 'ws://local-node:7000',
        startServer: false,
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 8,
        outboundQueueCriticalReserve: 4,
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
        'remote-node',
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const hotRecoveryTargetAddress =
        'remote-node/partition/sql_transactions-p1-r4';
      const criticalSourceDeliveries = [];
      for (let index = 0; index < 4; index++) {
        criticalSourceDeliveries.push(
          router.enqueueOutbound(
            'remote-node',
            async () => ({acknowledged: true, criticalIndex: index}),
            {
              deliveryPriority: 'critical',
              targetAddress: hotRecoveryTargetAddress,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const unrelatedCriticalDelivery = router.enqueueOutbound(
        'remote-node',
        async () => ({acknowledged: true, unrelated: true}),
        {
          deliveryPriority: 'critical',
          targetAddress: 'remote-node/service/control-plane',
          message: {
            type: 'NODE_STATE_UPDATE',
            node_id: 'remote-node',
            heartbeat_only: true,
          },
        },
      );
      await Promise.resolve();

      await t.rejects(
        router.enqueueOutbound(
          'remote-node',
          async () => ({acknowledged: true, overflow: true}),
          {
            deliveryPriority: 'critical',
            targetAddress: hotRecoveryTargetAddress,
            message: {},
          },
        ),
        /queue/i,
        'same-source critical recovery traffic should be rejected before it fills the node queue',
      );

      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery' &&
        entry.context?.backpressureScope === 'delivery_source');
      t.ok(
        saturationEntry,
        'router should emit one delivery-source saturation warning for critical recovery traffic',
      );
      t.equal(
        saturationEntry?.context?.attemptedDeliverySource,
        `target:${hotRecoveryTargetAddress}`,
        'warning should attribute the saturated critical recovery source',
      );
      t.equal(
        saturationEntry?.context?.pendingForSource,
        4,
        'warning should report the queued count for the saturated critical source',
      );
      t.equal(
        saturationEntry?.context?.pendingSourceLimit,
        4,
        'warning should report the bounded queued limit for one critical source',
      );
      t.equal(
        saturationEntry?.context?.sourceLimitApplied,
        true,
        'critical recovery traffic should participate in the delivery-source cap',
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        queue.pending.length,
        5,
        'unrelated critical traffic should still keep one slot when a hot critical source reaches its cap',
      );
      t.equal(
        queue.pending.filter((item) =>
          item?.deliverySource === `target:${hotRecoveryTargetAddress}`).length,
        4,
        'hot critical recovery traffic should stop at the bounded source cap',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(criticalSourceDeliveries);
      await unrelatedCriticalDelivery;
      await router.shutdown();
    },
  );

  t.test(
    'should defer scheduled reconnect deliveries before outbound queue admission',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'local-node',
        nodeAddress: 'ws://local-node:7000',
        startServer: false,
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 2,
        outboundQueueCriticalReserve: 1,
      });
      await router.initialize();

      let registeredPendingResponse = false;
      router.registerPendingResponse = () => {
        registeredPendingResponse = true;
        return new Promise(() => {});
      };

      const reconnectTimeout = setTimeout(() => {}, 30000);
      if (typeof reconnectTimeout.unref === 'function') {
        reconnectTimeout.unref();
      }
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
        configuredAddress: 'ws://remote-node:9999',
        observedAddress: null,
        state: ConnectionState.RECONNECTING,
        ws: null,
        isIncoming: false,
        isSelfConnection: false,
        reconnectTimeout,
        reconnectDueAt: Date.now() + 250,
      });

      const result = await router.deliver(
        'remote-node/partition/control_plane_publications-p1-r4',
        {type: 'TEST_MESSAGE', messageId: 'scheduled-reconnect-msg'},
        {deliveryPriority: 'critical'},
      );

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        result.acknowledged,
        false,
        'scheduled reconnect delivery should be deferred as retryable',
      );
      t.equal(
        result.errorCode,
        'ROUTER_CONNECTION_CLOSED',
        'scheduled reconnect failure should keep the connection-closed code',
      );
      t.equal(
        registeredPendingResponse,
        false,
        'scheduled reconnect fast-defer should not register a service waiter',
      );
      t.equal(
        queue.pending.length,
        0,
        'scheduled reconnect fast-defer should not occupy pending queue slots',
      );
      t.equal(
        queue.inFlight,
        0,
        'scheduled reconnect fast-defer should not occupy in-flight slots',
      );

      clearTimeout(reconnectTimeout);
      await router.shutdown();
    },
  );

  t.test(
    'should defer pending reconnect attempts before outbound queue admission',
    async (t) => {
      const router = new MessageRouter({
        nodeId: 'local-node',
        nodeAddress: 'ws://local-node:7000',
        startServer: false,
        outboundQueueMaxConcurrent: 1,
        outboundQueueMaxPending: 2,
        outboundQueueCriticalReserve: 1,
      });
      await router.initialize();

      let registeredPendingResponseCount = 0;
      router.registerPendingResponse = () => {
        registeredPendingResponseCount += 1;
        return new Promise(() => {});
      };
      router.nodeConnections.set('remote-node', {
        nodeId: 'remote-node',
        address: 'ws://remote-node:9999',
        configuredAddress: 'ws://remote-node:9999',
        observedAddress: null,
        state: ConnectionState.RECONNECTING,
        ws: null,
        isIncoming: false,
        isSelfConnection: false,
        reconnectTimeout: null,
        reconnectDueAt: null,
      });
      router.pendingNodeConnections.set(
        'remote-node',
        new Promise(() => {}),
      );

      const attempts = [];
      for (let index = 0; index < 4; index++) {
        attempts.push(router.deliver(
          'remote-node/partition/control_plane_publications-p1-r4',
          {type: 'TEST_MESSAGE', messageId: `pending-reconnect-msg-${index}`},
          {deliveryPriority: 'critical'},
        ));
      }
      const results = await Promise.all(attempts);

      const queue = router.getOutboundQueue('remote-node');
      t.equal(
        results.every((result) =>
          result?.acknowledged === false &&
          result?.errorCode === 'ROUTER_CONNECTION_CLOSED'),
        true,
        'pending reconnect deliveries should all be deferred as retryable',
      );
      t.equal(
        registeredPendingResponseCount,
        0,
        'pending reconnect fast-defer should not register service waiters',
      );
      t.equal(
        queue.pending.length,
        0,
        'pending reconnect fast-defer should not fill pending queue slots',
      );
      t.equal(
        queue.inFlight,
        0,
        'pending reconnect fast-defer should not fill in-flight source slots',
      );

      router.pendingNodeConnections.delete('remote-node');
      await router.shutdown();
    },
  );

  t.test(
    'should aggregate priority system targets outside generic fallback admission',
    async (t) => {
      const TEST_LOCAL_NODE_ID = 'local-node';
      const TEST_REMOTE_NODE_ID = 'remote-node';
      const TEST_NODE_ADDRESS = 'ws://local-node:7000';
      const TEST_MAX_CONCURRENT = 1;
      const TEST_MAX_PENDING = 64;
      const TEST_CRITICAL_RESERVE = 16;
      const TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES = 8;
      const TEST_PRIORITY_CONTROL_PLANE_TARGET_ADMISSION_KEY =
        'target:priority-control-plane';
      const TEST_GENERIC_TARGET_ADDRESS =
        'remote-node/partition/user_orders-p1-r4';
      const TEST_PRIORITY_TARGET_ADDRESSES = Object.freeze([
        'remote-node/partition/control_plane_publications-p1-r4',
        'remote-node/partition/replica_operations-p1-r4',
        'remote-node/partition/sql_transaction_participants-p1-r4',
        'remote-node/partition/sql_transactions-p1-r4',
        'remote-node/partition/sql_write_operations-p1-r4',
      ]);
      const router = new MessageRouter({
        nodeId: TEST_LOCAL_NODE_ID,
        nodeAddress: TEST_NODE_ADDRESS,
        startServer: false,
        outboundQueueMaxConcurrent: TEST_MAX_CONCURRENT,
        outboundQueueMaxPending: TEST_MAX_PENDING,
        outboundQueueCriticalReserve: TEST_CRITICAL_RESERVE,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const genericFallbackDeliveries = [];
      for (
        let index = 0;
        index < TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES;
        index++
      ) {
        genericFallbackDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            async () => ({acknowledged: true, genericIndex: index}),
            {
              deliveryPriority: 'critical',
              targetAddress: TEST_GENERIC_TARGET_ADDRESS,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const priorityDeliveries = [];
      for (const targetAddress of TEST_PRIORITY_TARGET_ADDRESSES) {
        priorityDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            async () => ({acknowledged: true, targetAddress}),
            {
              deliveryPriority: 'critical',
              targetAddress,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      const priorityTargetItems = queue.pending.filter((item) =>
        item?.deliverySourceAdmissionKey ===
        TEST_PRIORITY_CONTROL_PLANE_TARGET_ADMISSION_KEY);
      t.equal(
        priorityTargetItems.length,
        TEST_PRIORITY_TARGET_ADDRESSES.length,
        'priority system target traffic should share one admission key',
      );
      for (const targetAddress of TEST_PRIORITY_TARGET_ADDRESSES) {
        const prioritySource = `target:${targetAddress}`;
        t.equal(
          queue.pending.some((item) =>
            item?.deliverySourceAdmissionKey === prioritySource),
          false,
          `${targetAddress} should not keep a raw target admission key`,
        );
      }
      t.equal(
        queue.pending.filter((item) =>
          item?.deliverySourceAdmissionKey === 'target:critical-fallback')
          .length,
        TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES,
        'generic target fallback traffic should still occupy the aggregate bucket',
      );
      const stats = router.getStats()?.outboundQueues?.[TEST_REMOTE_NODE_ID];
      t.equal(
        stats?.pendingCriticalReserveEligible,
        0,
        'target-address backlog should not count as aggregate reserve eligible',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(genericFallbackDeliveries);
      await Promise.all(priorityDeliveries);
      await router.shutdown();
    },
  );

  t.test(
    'should cap combined priority system target pending admission',
    async (t) => {
      const TEST_LOCAL_NODE_ID = 'local-node';
      const TEST_REMOTE_NODE_ID = 'remote-node';
      const TEST_NODE_ADDRESS = 'ws://local-node:7000';
      const TEST_MAX_CONCURRENT = 1;
      const TEST_MAX_PENDING = 12;
      const TEST_CRITICAL_RESERVE = 4;
      const TEST_EXPECTED_PRIORITY_TARGET_PENDING_LIMIT = 8;
      const TEST_PRIORITY_TARGET_ADDRESSES = Object.freeze([
        'remote-node/partition/sql_transactions-p1-r5',
        'remote-node/partition/sql_transaction_participants-p1-r4',
      ]);
      const router = new MessageRouter({
        nodeId: TEST_LOCAL_NODE_ID,
        nodeAddress: TEST_NODE_ADDRESS,
        startServer: false,
        outboundQueueMaxConcurrent: TEST_MAX_CONCURRENT,
        outboundQueueMaxPending: TEST_MAX_PENDING,
        outboundQueueCriticalReserve: TEST_CRITICAL_RESERVE,
      });
      await router.initialize();

      let releaseFirstSend = null;
      const firstDelivery = router.enqueueOutbound(
        TEST_REMOTE_NODE_ID,
        () => new Promise((resolve) => {
          releaseFirstSend = () => resolve({acknowledged: true});
        }),
        {deliveryPriority: 'critical'},
      );
      await Promise.resolve();

      const admittedDeliveries = [];
      for (
        let index = 0;
        index < TEST_EXPECTED_PRIORITY_TARGET_PENDING_LIMIT;
        index++
      ) {
        const targetAddress =
          TEST_PRIORITY_TARGET_ADDRESSES[
            index % TEST_PRIORITY_TARGET_ADDRESSES.length
          ];
        admittedDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            async () => ({acknowledged: true, index}),
            {
              deliveryPriority: 'critical',
              targetAddress,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.pending.length,
        TEST_EXPECTED_PRIORITY_TARGET_PENDING_LIMIT,
        'combined priority system target backlog should reach the shared cap',
      );
      t.equal(
        resolveDeliverySourceAdmissionKey(
          'target:priority-control-plane',
          'critical',
        ),
        'target:priority-control-plane',
        'priority system target admission key should be idempotent',
      );
      t.equal(
        countCriticalPendingByAdmissionSource(
          queue,
          'target:priority-control-plane',
        ),
        TEST_EXPECTED_PRIORITY_TARGET_PENDING_LIMIT,
        'shared priority target key should count existing aggregate backlog',
      );
      t.equal(
        selectCriticalPendingSourcePreemptionCandidateIndex(
          queue,
          'target:priority-control-plane',
        ),
        -1,
        'shared priority target key should not preempt its own backlog',
      );
      await t.rejects(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          async () => ({acknowledged: true, overflow: true}),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_PRIORITY_TARGET_ADDRESSES[0],
            message: {},
          },
        ),
        /queue/i,
        'combined priority system target backlog should reject at the shared source cap',
      );
      const stats = router.getStats()?.outboundQueues?.[TEST_REMOTE_NODE_ID];
      t.equal(
        stats?.pendingCriticalReserveEligible,
        0,
        'shared priority target backlog should stay out of reserve accounting',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(admittedDeliveries);
      await router.shutdown();
    },
  );

  t.test(
    'should bound aggregate critical target fallback pending capacity',
    async (t) => {
      const TEST_LOCAL_NODE_ID = 'local-node';
      const TEST_REMOTE_NODE_ID = 'remote-node';
      const TEST_NODE_ADDRESS = 'ws://local-node:7000';
      const TEST_MAX_CONCURRENT = 1;
      const TEST_MAX_PENDING = 64;
      const TEST_CRITICAL_RESERVE = 16;
      const TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES = 8;
      const TEST_HOT_RECOVERY_TARGET_ADDRESS =
        'remote-node/partition/user_orders-p1-r4';
      const TEST_SECOND_HOT_RECOVERY_TARGET_ADDRESS =
        'remote-node/partition/user_payments-p1-r4';
      const TEST_CONTROL_PLANE_TARGET_ADDRESS =
        'remote-node/service/control-plane';
      const TEST_TARGET_FALLBACK_DELIVERY_SOURCES = [
        TEST_HOT_RECOVERY_TARGET_ADDRESS,
        TEST_SECOND_HOT_RECOVERY_TARGET_ADDRESS,
      ];
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
        index < TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES;
        index++
      ) {
        const targetAddress =
          TEST_TARGET_FALLBACK_DELIVERY_SOURCES[
            index % TEST_TARGET_FALLBACK_DELIVERY_SOURCES.length
          ];
        criticalSourceDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            async () => ({acknowledged: true, criticalIndex: index}),
            {
              deliveryPriority: 'critical',
              targetAddress,
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
      const targetFallbackPendingCount =
        TEST_TARGET_FALLBACK_DELIVERY_SOURCES.reduce(
          (count, targetAddress) =>
            count + queue.pending.filter((item) =>
              item?.deliverySource === `target:${targetAddress}`).length,
          0,
        );
      t.equal(
        targetFallbackPendingCount,
        TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES,
        'critical target fallback traffic should stop at the aggregate proportional cap',
      );
      t.equal(
        queue.pending.length,
        TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES + TEST_MAX_CONCURRENT,
        'semantic critical traffic should still keep one pending slot',
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
        'aggregate target fallback traffic should reject once the fallback cap is reached',
      );
      const saturationEntry = warnEntries.find((entry) =>
        entry.message === 'Outbound queue saturated for node delivery' &&
        entry.context?.backpressureScope === 'delivery_source');
      t.ok(
        saturationEntry,
        'router should emit one delivery-source saturation warning for target fallback traffic',
      );
      t.equal(
        saturationEntry?.context?.attemptedDeliverySource,
        `target:${TEST_HOT_RECOVERY_TARGET_ADDRESS}`,
        'warning should keep the raw attempted target fallback source',
      );
      t.equal(
        saturationEntry?.context?.pendingSourceSummary?.some((entry) =>
          entry.source === `target:${TEST_HOT_RECOVERY_TARGET_ADDRESS}`),
        true,
        'warning summary should keep the first raw target fallback bucket',
      );
      t.equal(
        saturationEntry?.context?.pendingSourceSummary?.some((entry) =>
          entry.source ===
          `target:${TEST_SECOND_HOT_RECOVERY_TARGET_ADDRESS}`),
        true,
        'warning summary should keep the second raw target fallback bucket',
      );
      t.equal(
        saturationEntry?.context?.pendingForSource,
        TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES,
        'warning should report the aggregate target fallback queued count',
      );
      t.equal(
        saturationEntry?.context?.pendingSourceLimit,
        TEST_ALLOWED_TARGET_FALLBACK_DELIVERIES,
        'warning should report the aggregate target fallback source cap',
      );
      t.equal(
        saturationEntry?.context?.inFlightForSource,
        0,
        'warning should report target fallback in-flight pressure for the admission key',
      );
      t.equal(
        saturationEntry?.context?.inFlightSourceLimit,
        TEST_MAX_CONCURRENT,
        'warning should report target fallback in-flight source cap',
      );

      releaseFirstSend();
      await firstDelivery;
      await Promise.all(criticalSourceDeliveries);
      await unrelatedCriticalDelivery;
      await router.shutdown();
    },
  );
});
