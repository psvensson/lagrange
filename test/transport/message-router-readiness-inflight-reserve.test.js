import t from '../../src/test-helpers/tap.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const TEST_LOCAL_NODE_ID = 'local-node';
const TEST_REMOTE_NODE_ID = 'remote-node';
const TEST_NODE_ADDRESS = 'ws://local-node:7000';
const TEST_FIRST_CRITICAL_TARGET = 'remote-node/partition/user_orders-p1-r4';
const TEST_READINESS_TARGET = 'remote-node/service/control-plane';
const TEST_BACKGROUND_TARGET = 'remote-node/service/metrics';
const TEST_ACKNOWLEDGED_KEY = 'acknowledged';

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

async function saturateCriticalInFlight(router, buildBlockingDelivery, track) {
  // A single blocking critical write fills the only concurrency slot, pinning
  // inFlight at maxConcurrent (1) with no free slot left for other lanes.
  track(
    router.enqueueOutbound(
      TEST_REMOTE_NODE_ID,
      buildBlockingDelivery('critical-a'),
      {
        deliveryPriority: 'critical',
        targetAddress: TEST_FIRST_CRITICAL_TARGET,
        message: {},
      },
    ),
  );
  await Promise.resolve();
}

t.test(
  'readiness reads dispatch from the in-flight reserve while CRITICAL ' +
    'recovery writes saturate the queue',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 1,
      outboundQueueMaxPending: 16,
      outboundQueueCriticalReserve: 1,
      outboundQueueReadinessInflightReserve: 1,
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
      return {[TEST_ACKNOWLEDGED_KEY]: true, label};
    };
    const track = (delivery) => {
      allDeliveries.push(delivery.catch((error) => ({error})));
    };

    try {
      await saturateCriticalInFlight(router, buildBlockingDelivery, track);

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.inFlight,
        queue.maxConcurrent,
        'CRITICAL traffic should pin in-flight at the concurrency limit',
      );

      track(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery('readiness'),
          {
            deliveryPriority: 'readiness',
            targetAddress: TEST_READINESS_TARGET,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      t.equal(
        startedDeliveries.includes('readiness'),
        true,
        'a readiness read should dispatch from the in-flight overflow reserve',
      );
      t.equal(
        queue.inFlightReadinessReserve,
        1,
        'the readiness overflow dispatch should be accounted in the reserve',
      );

      track(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery('background'),
          {
            deliveryPriority: 'background',
            targetAddress: TEST_BACKGROUND_TARGET,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      t.equal(
        startedDeliveries.includes('background'),
        false,
        'background traffic must not borrow the readiness in-flight reserve',
      );

      track(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery('readiness-2'),
          {
            deliveryPriority: 'readiness',
            targetAddress: TEST_READINESS_TARGET,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      t.equal(
        startedDeliveries.includes('readiness-2'),
        false,
        'the readiness in-flight reserve should be bounded to its limit',
      );
    } finally {
      releaseAllSends?.();
      await Promise.allSettled(allDeliveries);
      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.inFlightReadinessReserve,
        0,
        'the readiness reserve should drain back to zero after completion',
      );
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);

t.test(
  'a zero readiness in-flight reserve keeps readiness reads pending under ' +
    'CRITICAL saturation (backward-compatible default)',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 1,
      outboundQueueMaxPending: 16,
      outboundQueueCriticalReserve: 1,
      outboundQueueReadinessInflightReserve: 0,
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
      return {[TEST_ACKNOWLEDGED_KEY]: true, label};
    };
    const track = (delivery) => {
      allDeliveries.push(delivery.catch((error) => ({error})));
    };

    try {
      await saturateCriticalInFlight(router, buildBlockingDelivery, track);

      track(
        router.enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery('readiness'),
          {
            deliveryPriority: 'readiness',
            targetAddress: TEST_READINESS_TARGET,
            message: {},
          },
        ),
      );
      await Promise.resolve();

      t.equal(
        startedDeliveries.includes('readiness'),
        false,
        'with a zero reserve readiness reads must wait behind the limit',
      );
      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.inFlightReadinessReserve,
        0,
        'no overflow should be accounted when the reserve is disabled',
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
  'readiness reads below the concurrency limit stay bounded by the critical ' +
    'headroom cap so CRITICAL reserve slots are preserved',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 4,
      outboundQueueMaxPending: 16,
      outboundQueueCriticalReserve: 2,
      outboundQueueReadinessInflightReserve: 0,
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
      return {[TEST_ACKNOWLEDGED_KEY]: true, label};
    };
    const track = (delivery) => {
      allDeliveries.push(delivery.catch((error) => ({error})));
    };

    try {
      for (let index = 0; index < 4; index++) {
        track(
          router.enqueueOutbound(
            TEST_REMOTE_NODE_ID,
            buildBlockingDelivery(`readiness-${index}`),
            {
              deliveryPriority: 'readiness',
              targetAddress: TEST_READINESS_TARGET,
              message: {},
            },
          ),
        );
        await Promise.resolve();
      }

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      const startedReadiness = startedDeliveries.filter((label) =>
        label.startsWith('readiness'),
      );
      t.equal(
        startedReadiness.length,
        queue.maxConcurrent - queue.criticalReserve,
        'readiness should not consume the slots reserved for CRITICAL ' +
          'recovery while below the concurrency limit',
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
  'getStats exposes the readiness in-flight reserve configuration and usage',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: 4,
      outboundQueueMaxPending: 16,
      outboundQueueReadinessInflightReserve: 2,
    });
    await router.initialize();
    try {
      // Force queue creation so diagnostics surface a queue entry.
      router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      const stats = router.getStats();
      const queueStats = stats.outboundQueues[TEST_REMOTE_NODE_ID];
      t.ok(queueStats, 'queue diagnostics should be present');
      t.equal(
        queueStats.readinessInflightReserve,
        2,
        'configured readiness in-flight reserve should surface in stats',
      );
      t.equal(
        queueStats.readinessInflightReserveLimit,
        2,
        'resolved readiness in-flight reserve limit should surface in stats',
      );
      t.equal(
        queueStats.inFlightReadinessReserve,
        0,
        'idle readiness in-flight reserve usage should be zero',
      );
    } finally {
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);
