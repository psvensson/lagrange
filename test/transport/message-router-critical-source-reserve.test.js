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
const TEST_TOTAL_HOT_DELIVERIES = 32;
const TEST_EXPECTED_HOT_IN_FLIGHT_CAP = 16;
const TEST_EXPECTED_HOT_PENDING_COUNT = 16;
const TEST_HOT_TARGET_ADDRESS =
  'remote-node/partition/sql_transactions-p1-r4';
const TEST_CONTROL_PLANE_TARGET_ADDRESS =
  'remote-node/service/control-plane';
const TEST_HOT_LABEL_PREFIX = 'hot';
const TEST_CONTROL_PLANE_LABEL = 'control-plane';
const TEST_ACKNOWLEDGED_KEY = 'acknowledged';
const TEST_HEARTBEAT_ONLY_KEY = 'heartbeat_only';
const TEST_NODE_ID_KEY = 'node_id';
const TEST_TYPE_KEY = 'type';
const TEST_NODE_STATE_UPDATE_TYPE = 'NODE_STATE_UPDATE';

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
