import t from '../../src/test-helpers/tap.js';
import {
  isOutboundNodeBackpressured,
  resolveBoundedReadinessReserve,
  resolveCriticalPendingCeiling,
  normalizeOutboundDeliveryPriority,
} from '../../src/transport/message-router-shared-stage-2.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {TRANSPORT_DEFAULT} from '../../src/constants/transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const TEST_LOCAL_NODE_ID = 'local-node';
const TEST_REMOTE_NODE_ID = 'remote-node';
const TEST_NODE_ADDRESS = 'ws://local-node:7000';
const TEST_MAX_CONCURRENT = 64;
const TEST_MAX_PENDING = 16;
const TEST_READINESS_RESERVE = 4;
const TEST_CRITICAL_CEILING = TEST_MAX_PENDING - TEST_READINESS_RESERVE;
const PRIORITY_CRITICAL = 'critical';
const PRIORITY_READINESS = 'readiness';
const TEST_READINESS_TARGET_ADDRESS =
  'remote-node/service/control-plane-readiness';
const TEST_CRITICAL_TARGET_PREFIX =
  'remote-node/partition/sql_transactions-p';
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

t.test(
  'readiness reserve carves CRITICAL pending ceiling below maxPending',
  async (t) => {
    const queue = {
      maxPending: TEST_MAX_PENDING,
      readinessReserve: TEST_READINESS_RESERVE,
    };
    t.equal(
      resolveBoundedReadinessReserve(TEST_READINESS_RESERVE, TEST_MAX_PENDING),
      TEST_READINESS_RESERVE,
      'a configured readiness reserve within bounds is preserved',
    );
    t.equal(
      resolveCriticalPendingCeiling(queue),
      TEST_CRITICAL_CEILING,
      'CRITICAL pending ceiling is maxPending minus the readiness reserve',
    );
    t.equal(
      resolveBoundedReadinessReserve(TEST_MAX_PENDING * 2, TEST_MAX_PENDING),
      TEST_MAX_PENDING,
      'an over-large readiness reserve is clamped to the queue maxPending',
    );
    t.end();
  },
);

t.test(
  'readiness work is admitted at the CRITICAL pending ceiling while ' +
    'CRITICAL traffic is shed there',
  async (t) => {
    const queueAtCeiling = {
      maxPending: TEST_MAX_PENDING,
      readinessReserve: TEST_READINESS_RESERVE,
      pending: {length: TEST_CRITICAL_CEILING},
    };
    t.equal(
      isOutboundNodeBackpressured(queueAtCeiling, PRIORITY_CRITICAL, 0, 0),
      true,
      'CRITICAL is backpressured once pending reaches the reserve ceiling',
    );
    t.equal(
      isOutboundNodeBackpressured(queueAtCeiling, PRIORITY_READINESS, 0, 0),
      false,
      'READINESS still admits into the reserved headroom above the ceiling',
    );
    const queueFull = {
      maxPending: TEST_MAX_PENDING,
      readinessReserve: TEST_READINESS_RESERVE,
      pending: {length: TEST_MAX_PENDING},
    };
    t.equal(
      isOutboundNodeBackpressured(queueFull, PRIORITY_READINESS, 0, 0),
      true,
      'READINESS is only backpressured once the whole queue is saturated',
    );
    t.end();
  },
);

t.test(
  'normalizeOutboundDeliveryPriority recognizes the readiness tier',
  async (t) => {
    t.equal(
      normalizeOutboundDeliveryPriority(PRIORITY_READINESS, ''),
      PRIORITY_READINESS,
      'an explicit readiness priority is preserved',
    );
    t.end();
  },
);

t.test(
  'a readiness send is admitted while CRITICAL recovery saturates the queue',
  async (t) => {
    initializeTestEnvironment();
    const router = new MessageRouter({
      nodeId: TEST_LOCAL_NODE_ID,
      nodeAddress: TEST_NODE_ADDRESS,
      startServer: false,
      outboundQueueMaxConcurrent: TEST_MAX_CONCURRENT,
      outboundQueueMaxPending: TEST_MAX_PENDING,
      outboundQueueCriticalReserve: 0,
      outboundQueueReadinessReserve: TEST_READINESS_RESERVE,
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

    try {
      // Saturate the queue's CRITICAL pending ceiling using semantic recovery
      // sources so raw target-fallback admission does not cap this fixture.
      const criticalEnqueueCount = TEST_MAX_CONCURRENT + TEST_CRITICAL_CEILING;
      for (let index = 0; index < criticalEnqueueCount; index++) {
        allDeliveries.push(
          router
            .enqueueOutbound(
              TEST_REMOTE_NODE_ID,
              buildBlockingDelivery(`critical-${index}`),
              {
                deliveryPriority: PRIORITY_CRITICAL,
                deliverySource: `semantic-critical-${index}`,
                targetAddress: `${TEST_CRITICAL_TARGET_PREFIX}${index}-r1`,
                message: {},
              },
            )
            .catch((error) => ({rejected: true, error})),
        );
        await Promise.resolve();
      }

      const queue = router.getOutboundQueue(TEST_REMOTE_NODE_ID);
      t.equal(
        queue.pending.length,
        TEST_CRITICAL_CEILING,
        'CRITICAL backlog stops at the reserve-protected pending ceiling',
      );

      // A fresh CRITICAL source is shed at the ceiling...
      const blockedCritical = await router
        .enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery('critical-overflow'),
          {
            deliveryPriority: PRIORITY_CRITICAL,
            deliverySource: 'semantic-critical-overflow',
            targetAddress: `${TEST_CRITICAL_TARGET_PREFIX}overflow-r1`,
            message: {},
          },
        )
        .then(() => ({rejected: false}))
        .catch((error) => ({rejected: true, error}));
      t.equal(
        blockedCritical.rejected,
        true,
        'a fresh CRITICAL source is shed once the reserve ceiling is reached',
      );
      // Workstream B: the shed backpressure error must carry a retry hint so the
      // coordinator handoff retry scheduler backs off instead of re-arming at
      // the base cadence.
      t.equal(
        blockedCritical.error?.deferRetry,
        true,
        'the shed backpressure error defers the retry',
      );
      t.equal(
        blockedCritical.error?.retryAfterMs,
        TRANSPORT_DEFAULT.OUTBOUND_QUEUE_BACKPRESSURE_RETRY_AFTER_MS,
        'the shed backpressure error surfaces the configured retry-after hint',
      );

      // ...while a READINESS send is still admitted into the reserved headroom.
      const readinessPromise = router
        .enqueueOutbound(
          TEST_REMOTE_NODE_ID,
          buildBlockingDelivery('readiness'),
          {
            deliveryPriority: PRIORITY_READINESS,
            targetAddress: TEST_READINESS_TARGET_ADDRESS,
            message: {},
          },
        )
        .then(() => ({admitted: true}))
        .catch((error) => ({admitted: false, error}));
      allDeliveries.push(readinessPromise);
      await Promise.resolve();

      const admittedReadiness = queue.pending.some(
        (item) => item?.priority === PRIORITY_READINESS,
      );
      t.equal(
        admittedReadiness,
        true,
        'the readiness send is admitted into the protected reserve headroom',
      );
      t.equal(
        queue.pending.length,
        TEST_CRITICAL_CEILING + 1,
        'readiness admission consumes reserved headroom above the ceiling',
      );

      releaseAllSends();
      const readinessOutcome = await readinessPromise;
      t.equal(
        readinessOutcome.admitted,
        true,
        'the admitted readiness send completes once the gate releases',
      );
    } finally {
      releaseAllSends?.();
      await Promise.allSettled(allDeliveries);
      await router.shutdown();
      cleanupTestEnvironment();
    }
  },
);
