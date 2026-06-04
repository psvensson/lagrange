import t from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const TEST_LOCAL_NODE_ID = 'local-node';
const TEST_REMOTE_NODE_ID = 'remote-node';
const TEST_NODE_ADDRESS = 'ws://local-node:7000';
const TEST_MAX_CONCURRENT = 32;
const TEST_MAX_PENDING = 64;
const TEST_CRITICAL_RESERVE = 16;
const TEST_READINESS_RESERVE = 2;
const TEST_TOTAL_HOT_DELIVERIES = 32;
const TEST_EXPECTED_HOT_IN_FLIGHT_CAP = 16;
const TEST_EXPECTED_HOT_PENDING_COUNT = 16;
const TEST_HOT_TARGET_ADDRESS =
  'remote-node/partition/sql_transactions-p1-r4';
const TEST_SECOND_HOT_TARGET_ADDRESS =
  'remote-node/partition/sql_transaction_participants-p1-r4';
const TEST_CONTROL_PLANE_TARGET_ADDRESS =
  'remote-node/service/control-plane';
const TEST_HANDOFF_DELIVERY_SOURCE = 'coordinator_created_remote_handoff';
const TEST_TARGET_FALLBACK_TARGET_ADDRESS =
  'remote-node/partition/control_plane_publications-p1-r4';
const TEST_HOT_LABEL_PREFIX = 'hot';
const TEST_CONTROL_PLANE_LABEL = 'control-plane';
const TEST_TARGET_FALLBACK_LABEL = 'target-fallback';
const TEST_REPLACEABLE_LABEL = 'replaceable';
const TEST_REPLACEABLE_SOURCE = 'replaceable_semantic_source';
const TEST_REPLACEABLE_KEY = 'replaceable:control-plane';
const TEST_HEARTBEAT_LABEL = 'heartbeat';
const TEST_ACKNOWLEDGED_KEY = 'acknowledged';
const TEST_HEARTBEAT_ONLY_KEY = 'heartbeat_only';
const TEST_NODE_ID_KEY = 'node_id';
const TEST_TYPE_KEY = 'type';
const TEST_NODE_STATE_UPDATE_TYPE = 'NODE_STATE_UPDATE';
const TEST_REPLICA_OPERATION_DISPATCH_TYPE = 'REPLICA_OPERATION_DISPATCH';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: TEST_LOCAL_NODE_ID},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

t.test(
  'MessageRouter keeps reserve-protected critical in-flight capacity for ' +
    'large hot delivery sources',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: TEST_MAX_CONCURRENT,
      outboundQueueMaxPending: TEST_MAX_PENDING,
      outboundQueueCriticalReserve: TEST_CRITICAL_RESERVE,
    });
    await router.initialize();

    let releaseAllSends = null;
    const sendGate = new Promise((resolve) => {
      releaseAllSends = resolve;
    });
    const startedDeliveries = [];
    const allDeliveries = [];
    const buildBlockingDelivery = (label) => async () => {
      startedDeliveries.push(label);
      await sendGate;
      return {
        [TEST_ACKNOWLEDGED_KEY]: true,
        label,
      };
    };

    try {
      for (let index = 0; index < TEST_TOTAL_HOT_DELIVERIES; index++) {
        allDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            buildBlockingDelivery(`${TEST_HOT_LABEL_PREFIX}-${index}`),
            {
              deliveryPriority: 'critical',
              targetAddress: TEST_HOT_TARGET_ADDRESS,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        startedDeliveries.length,
        TEST_EXPECTED_HOT_IN_FLIGHT_CAP,
        'hot critical traffic should stop at the reserve-protected in-flight cap',
      );
      t.equal(
        queue.inFlightCritical,
        TEST_EXPECTED_HOT_IN_FLIGHT_CAP,
        'hot critical traffic should consume only the allowed in-flight share',
      );
      t.equal(
        queue.pending.length,
        TEST_EXPECTED_HOT_PENDING_COUNT,
        'the remaining hot traffic should stay queued behind the protected reserve',
      );

      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(TEST_CONTROL_PLANE_LABEL),
          {
            deliveryPriority: 'critical',
            deliverySource: TEST_HANDOFF_DELIVERY_SOURCE,
            targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
            message: {
              [TEST_TYPE_KEY]: TEST_REPLICA_OPERATION_DISPATCH_TYPE,
            },
          },
        ),
      );
      await Promise.resolve();

      t.equal(
        startedDeliveries.includes(TEST_CONTROL_PLANE_LABEL),
        true,
        'a different critical source should dispatch immediately from the protected reserve',
      );
    } finally {
      releaseAllSends?.();
      await Promise.allSettled(allDeliveries);
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);

t.test(
  'MessageRouter preserves readiness headroom while admitting critical reserve source',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 4,
      outboundQueueMaxPending: 8,
      outboundQueueCriticalReserve: 2,
      outboundQueueReadinessReserve: TEST_READINESS_RESERVE,
    });
    await router.initialize();

    let releaseAllSends = null;
    const sendGate = new Promise((resolve) => {
      releaseAllSends = resolve;
    });
    const startedDeliveries = [];
    const allDeliveries = [];
    const criticalPendingCeiling = 8 - TEST_READINESS_RESERVE;
    const buildBlockingDelivery = (label) => async () => {
      startedDeliveries.push(label);
      await sendGate;
      return {
        [TEST_ACKNOWLEDGED_KEY]: true,
        label,
      };
    };
    const trackDelivery = (delivery) => {
      allDeliveries.push(delivery.catch((error) => ({error})));
    };

    try {
      const hotTargets = [
        TEST_HOT_TARGET_ADDRESS,
        TEST_HOT_TARGET_ADDRESS,
        TEST_SECOND_HOT_TARGET_ADDRESS,
        TEST_SECOND_HOT_TARGET_ADDRESS,
        TEST_HOT_TARGET_ADDRESS,
        TEST_SECOND_HOT_TARGET_ADDRESS,
        TEST_HOT_TARGET_ADDRESS,
        TEST_SECOND_HOT_TARGET_ADDRESS,
        TEST_HOT_TARGET_ADDRESS,
        TEST_SECOND_HOT_TARGET_ADDRESS,
      ];
      for (const [index, targetAddress] of hotTargets.entries()) {
        trackDelivery(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            buildBlockingDelivery(`${TEST_HOT_LABEL_PREFIX}-${index}`),
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
        criticalPendingCeiling,
        'hot critical traffic should fill only the readiness-protected ceiling',
      );

      trackDelivery(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(TEST_CONTROL_PLANE_LABEL),
          {
            deliveryPriority: 'critical',
            deliverySource: TEST_HANDOFF_DELIVERY_SOURCE,
            targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
            message: {
              [TEST_TYPE_KEY]: TEST_REPLICA_OPERATION_DISPATCH_TYPE,
            },
          },
        ),
      );
      await Promise.resolve();

      t.equal(
        startedDeliveries.includes(TEST_CONTROL_PLANE_LABEL),
        true,
        'the distinct critical source should dispatch through reserve capacity',
      );
      t.ok(
        queue.pending.length <= criticalPendingCeiling,
        'critical reserve admission should not consume readiness headroom',
      );
    } finally {
      releaseAllSends?.();
      await Promise.allSettled(allDeliveries);
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);

t.test(
  'MessageRouter uses critical reserve when aggregate critical in-flight is full',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 4,
      outboundQueueMaxPending: 16,
      outboundQueueCriticalReserve: 2,
    });
    await router.initialize();

    let releaseAllSends = null;
    const sendGate = new Promise((resolve) => {
      releaseAllSends = resolve;
    });
    const startedDeliveries = [];
    const allDeliveries = [];
    const buildBlockingDelivery = (label) => async () => {
      startedDeliveries.push(label);
      await sendGate;
      return {
        [TEST_ACKNOWLEDGED_KEY]: true,
        label,
      };
    };

    try {
      const hotTargets = [
        TEST_HOT_TARGET_ADDRESS,
        TEST_HOT_TARGET_ADDRESS,
        TEST_SECOND_HOT_TARGET_ADDRESS,
        TEST_SECOND_HOT_TARGET_ADDRESS,
        TEST_HOT_TARGET_ADDRESS,
        TEST_SECOND_HOT_TARGET_ADDRESS,
      ];
      for (const [index, targetAddress] of hotTargets.entries()) {
        allDeliveries.push(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            buildBlockingDelivery(`${TEST_HOT_LABEL_PREFIX}-${index}`),
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
        queue.inFlight,
        4,
        'two hot critical sources should fill aggregate in-flight capacity',
      );
      t.equal(
        queue.pending.length,
        2,
        'hot critical sources should leave a pending backlog',
      );

      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(TEST_CONTROL_PLANE_LABEL),
          {
            deliveryPriority: 'critical',
            deliverySource: TEST_HANDOFF_DELIVERY_SOURCE,
            targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
            message: {
              [TEST_TYPE_KEY]: TEST_REPLICA_OPERATION_DISPATCH_TYPE,
            },
          },
        ),
      );
      await Promise.resolve();

      t.equal(
        startedDeliveries.includes(TEST_CONTROL_PLANE_LABEL),
        true,
        'a distinct critical source should dispatch through reserve capacity',
      );
      t.equal(
        queue.inFlightCriticalSourceReserve,
        1,
        'aggregate reserve dispatch should account for the borrowed slot',
      );
    } finally {
      releaseAllSends?.();
      await Promise.allSettled(allDeliveries);
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);

t.test(
  'MessageRouter admits semantic critical reserve source with one normal slot',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 1,
      outboundQueueMaxPending: 4,
      outboundQueueCriticalReserve: 1,
    });
    await router.initialize();

    let releaseAllSends = null;
    const sendGate = new Promise((resolve) => {
      releaseAllSends = resolve;
    });
    const startedDeliveries = [];
    const allDeliveries = [];
    const buildBlockingDelivery = (label) => async () => {
      startedDeliveries.push(label);
      await sendGate;
      return {
        [TEST_ACKNOWLEDGED_KEY]: true,
        label,
      };
    };

    try {
      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(`${TEST_HOT_LABEL_PREFIX}-0`),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_HOT_TARGET_ADDRESS,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(`${TEST_HOT_LABEL_PREFIX}-1`),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_HOT_TARGET_ADDRESS,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.inFlight,
        1,
        'one hot critical target should fill the only normal slot',
      );
      t.equal(
        queue.pending.length,
        1,
        'the second hot target should wait while aggregate in-flight is full',
      );

      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(TEST_CONTROL_PLANE_LABEL),
          {
            deliveryPriority: 'critical',
            deliverySource: TEST_HANDOFF_DELIVERY_SOURCE,
            targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
            message: {
              [TEST_TYPE_KEY]: TEST_REPLICA_OPERATION_DISPATCH_TYPE,
            },
          },
        ),
      );
      await Promise.resolve();

      t.equal(
        startedDeliveries.includes(TEST_CONTROL_PLANE_LABEL),
        true,
        'the semantic handoff source should borrow reserve capacity',
      );
      t.equal(
        queue.inFlightCriticalSourceReserve,
        1,
        'single-slot reserve dispatch should be counted',
      );
    } finally {
      releaseAllSends?.();
      await Promise.allSettled(allDeliveries);
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);

t.test(
  'MessageRouter keeps aggregate reserve from target fallback and arbitrary replaceable sources',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 1,
      outboundQueueMaxPending: 6,
      outboundQueueCriticalReserve: 1,
    });
    await router.initialize();

    let releaseAllSends = null;
    const sendGate = new Promise((resolve) => {
      releaseAllSends = resolve;
    });
    const startedDeliveries = [];
    const allDeliveries = [];
    const buildBlockingDelivery = (label) => async () => {
      startedDeliveries.push(label);
      await sendGate;
      return {
        [TEST_ACKNOWLEDGED_KEY]: true,
        label,
      };
    };

    try {
      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(`${TEST_HOT_LABEL_PREFIX}-0`),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_HOT_TARGET_ADDRESS,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(TEST_TARGET_FALLBACK_LABEL),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_TARGET_FALLBACK_TARGET_ADDRESS,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(TEST_REPLACEABLE_LABEL),
          {
            deliveryPriority: 'critical',
            deliverySource: TEST_REPLACEABLE_SOURCE,
            replacePendingKey: TEST_REPLACEABLE_KEY,
            targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        startedDeliveries.includes(TEST_TARGET_FALLBACK_LABEL),
        false,
        'target fallback traffic should not borrow aggregate reserve',
      );
      t.equal(
        startedDeliveries.includes(TEST_REPLACEABLE_LABEL),
        false,
        'arbitrary replaceable traffic should not borrow aggregate reserve',
      );
      t.equal(
        queue.inFlightCriticalSourceReserve,
        0,
        'excluded sources should leave aggregate reserve unused',
      );
    } finally {
      releaseAllSends?.();
      await Promise.allSettled(allDeliveries);
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);

t.test(
  'MessageRouter lets replaceable heartbeat node-state update borrow aggregate reserve',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 1,
      outboundQueueMaxPending: 6,
      outboundQueueCriticalReserve: 1,
    });
    await router.initialize();

    let releaseAllSends = null;
    const sendGate = new Promise((resolve) => {
      releaseAllSends = resolve;
    });
    const startedDeliveries = [];
    const allDeliveries = [];
    const buildBlockingDelivery = (label) => async () => {
      startedDeliveries.push(label);
      await sendGate;
      return {
        [TEST_ACKNOWLEDGED_KEY]: true,
        label,
      };
    };

    try {
      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(`${TEST_HOT_LABEL_PREFIX}-0`),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_HOT_TARGET_ADDRESS,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(TEST_TARGET_FALLBACK_LABEL),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_HOT_TARGET_ADDRESS,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      allDeliveries.push(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery(TEST_HEARTBEAT_LABEL),
          {
            deliveryPriority: 'critical',
            targetAddress: TEST_CONTROL_PLANE_TARGET_ADDRESS,
            message: {
              [TEST_TYPE_KEY]: TEST_NODE_STATE_UPDATE_TYPE,
              [TEST_NODE_ID_KEY]: TEST_REMOTE_NODE_ID,
              [TEST_HEARTBEAT_ONLY_KEY]: true,
            },
          },
        ),
      );
      await Promise.resolve();

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        startedDeliveries.includes(TEST_TARGET_FALLBACK_LABEL),
        false,
        'target fallback traffic should remain pending behind saturation',
      );
      t.equal(
        startedDeliveries.includes(TEST_HEARTBEAT_LABEL),
        true,
        'heartbeat node-state update should borrow aggregate reserve',
      );
      t.equal(
        queue.inFlightCriticalSourceReserve,
        1,
        'heartbeat reserve dispatch should account for the borrowed slot',
      );
    } finally {
      releaseAllSends?.();
      await Promise.allSettled(allDeliveries);
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);
