/**
 * Preservation A — Background Retry Within Bounds
 *
 * Property 3 (Preservation A): For any CDC background retry where the
 * attempt number is below the configured deliveryRetryMaxAttempts and
 * delivery fails, scheduleBackgroundRetry SHALL continue to schedule
 * the next retry attempt with exponential backoff, preserving the
 * existing retry-and-recover behavior for temporarily unreachable nodes.
 *
 * These tests MUST PASS on UNFIXED code — they capture baseline behavior
 * that must remain unchanged after the fix.
 *
 * **Validates: Requirements 3.1, 3.2, 3.7**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  TABLES,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  LATENCY_PROPAGATION_MODE,
} from '../../src/topology/latency-topology-constants.js';
import {
  CDC_GROUP_PROPAGATION_RETRY,
} from '../../src/topology/cdc-group-propagation-constants.js';
import {
  CDCGroupPropagationService,
} from '../../src/topology/cdc-group-propagation-service.js';

const TEST_NODE_ID = 'node-preserve-a';
const TEST_TABLE_NAME = TABLES.NODES;
const TEST_OPERATION = 'UPDATE';
const TEST_GROUP_ID = 'g-preserve-2';
const TEST_COORDINATOR_NODE_ID = 'node-preserve-b';
const TEST_ADDRESS = 'node-preserve-b/message-group/mg-node-preserve-b';

function setupConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: TEST_NODE_ID},
    logging: {level: 'error'},
    latency: {
      groupThresholdMs: 100,
      recalcIntervalMs: 1000,
      recalcJitterRatio: 0.1,
      pingTimeoutMs: 50,
      pingRetryCount: 2,
      smoothingAlpha: 0.5,
      propagationMode: LATENCY_PROPAGATION_MODE.SAFE,
    },
  });
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createTopologyCache() {
  const nodeRows = new Map([
    [TEST_NODE_ID, {[COLUMN.NODE_ID]: TEST_NODE_ID}],
  ]);
  const serviceRows = [
    {
      [COLUMN.SERVICE_ID]: 'mg-node-preserve-b',
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
      [COLUMN.NODE_ID]: TEST_COORDINATOR_NODE_ID,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.ADDRESS]: TEST_ADDRESS,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    },
  ];
  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.LATENCY_GROUPS) {
        return [];
      }
      return [];
    },
    filter(tableName, predicate) {
      if (tableName !== TABLES.SERVICES) {
        return [];
      }
      return serviceRows.filter((row) => predicate(row));
    },
  };
}

/**
 * Force-clear all background retry timers to prevent process hang.
 * @param {CDCGroupPropagationService} service - The service instance.
 */
function forceCleanupTimers(service) {
  for (const timer of service.backgroundRetryTimers) {
    clearTimeout(timer);
  }
  service.backgroundRetryTimers.clear();
}

test('Property 3 Preservation A: scheduleBackgroundRetry SHALL schedule ' +
  'a retry timer when attempt is below deliveryRetryMaxAttempts and ' +
  'delivery fails ' +
  '(uses scheduleBackgroundRetry owner path)', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({
        min: 1,
        max: CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS - 1,
      }),
      async (attempt) => {
        setupConfig();
        const cache = createTopologyCache();
        const service = new CDCGroupPropagationService({
          nodeId: TEST_NODE_ID,
          systemTableCache: cache,
          messageRouter: {
            async deliver() {
              return {acknowledged: false, error: 'unreachable'};
            },
          },
          latencyTreeService: {getRoutingOrder: () => []},
          nowFn: () => 1000,
          deliveryRetryMaxAttempts:
            CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS,
          deliveryRetryDelayMs: 1,
          deliveryRetryMaxDelayMs: 1,
          deliveryRetryBackoffMultiplier: 1,
        });
        service.logger = {
          info() {},
          warn() {},
          debug() {},
        };
        service.initialize();
        service.start();

        try {
          const timerCountBefore =
            service.backgroundRetryTimers.size;

          service.scheduleBackgroundRetry({
            tableName: TEST_TABLE_NAME,
            operation: TEST_OPERATION,
            data: {[COLUMN.NODE_ID]: 'node-z'},
            sourceGroupId: 'g-1',
            targets: [{
              groupId: TEST_GROUP_ID,
              coordinatorNodeId: TEST_COORDINATOR_NODE_ID,
              address: TEST_ADDRESS,
            }],
            attempt,
          });

          const timerCountAfter =
            service.backgroundRetryTimers.size;

          // Preservation: below-max attempts with failed delivery
          // MUST schedule a retry timer.
          assert.equal(
            timerCountAfter,
            timerCountBefore + 1,
            'scheduleBackgroundRetry should schedule a timer ' +
            `when attempt=${attempt} < MAX_ATTEMPTS=` +
            `${CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS}, ` +
            'but backgroundRetryTimers went from ' +
            `${timerCountBefore} to ${timerCountAfter}`,
          );
        } finally {
          service.stop();
          forceCleanupTimers(service);
          teardownConfig();
        }
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 3 Preservation A: successful delivery SHALL NOT trigger ' +
  'a background retry ' +
  '(uses scheduleBackgroundRetry owner path)', async (t) => {
  const maxTotalAttempts =
    CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS +
    CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS;
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: maxTotalAttempts - 1}),
      async (attempt) => {
        setupConfig();
        const cache = createTopologyCache();
        const service = new CDCGroupPropagationService({
          nodeId: TEST_NODE_ID,
          systemTableCache: cache,
          messageRouter: {
            async deliver() {
              return {acknowledged: true};
            },
          },
          latencyTreeService: {getRoutingOrder: () => []},
          nowFn: () => 1000,
          deliveryRetryMaxAttempts:
            CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS,
          deliveryRetryDelayMs: 1,
          deliveryRetryMaxDelayMs: 1,
          deliveryRetryBackoffMultiplier: 1,
        });
        service.logger = {
          info() {},
          warn() {},
          debug() {},
        };
        service.initialize();
        service.start();

        try {
          // Schedule a background retry that will succeed on
          // delivery — the timer callback should NOT schedule
          // another retry after success.
          service.scheduleBackgroundRetry({
            tableName: TEST_TABLE_NAME,
            operation: TEST_OPERATION,
            data: {[COLUMN.NODE_ID]: 'node-z'},
            sourceGroupId: 'g-1',
            targets: [{
              groupId: TEST_GROUP_ID,
              coordinatorNodeId: TEST_COORDINATOR_NODE_ID,
              address: TEST_ADDRESS,
            }],
            attempt,
          });

          // One timer should be scheduled for the initial retry.
          assert.equal(
            service.backgroundRetryTimers.size,
            1,
            'One timer should be scheduled for the retry attempt',
          );

          // Wait for the timer to fire and delivery to succeed.
          await new Promise((resolve) =>
            setTimeout(resolve, 10));

          // After successful delivery, no further timers should
          // remain (the fired timer deletes itself, and no new
          // timer is scheduled on success).
          assert.equal(
            service.backgroundRetryTimers.size,
            0,
            'No background retry timers should remain after ' +
            'successful delivery',
          );
        } finally {
          service.stop();
          forceCleanupTimers(service);
          teardownConfig();
        }
      },
    ),
    {numRuns: 10},
  );
  t.end();
});

test('Property 3 Preservation A: clearBackgroundRetryTimers on stop() ' +
  'SHALL clear all pending timers ' +
  '(uses stop owner path)', async (t) => {
  setupConfig();
  const cache = createTopologyCache();
  const service = new CDCGroupPropagationService({
    nodeId: TEST_NODE_ID,
    systemTableCache: cache,
    messageRouter: {
      async deliver() {
        return {acknowledged: false, error: 'unreachable'};
      },
    },
    latencyTreeService: {getRoutingOrder: () => []},
    nowFn: () => 1000,
    deliveryRetryMaxAttempts:
      CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS,
    deliveryRetryDelayMs: 100000,
    deliveryRetryMaxDelayMs: 100000,
    deliveryRetryBackoffMultiplier: 1,
  });
  service.logger = {
    info() {},
    warn() {},
    debug() {},
  };
  service.initialize();
  service.start();

  try {
    // Schedule multiple background retries with long delays so
    // they remain pending.
    const timerCount = 3;
    for (let i = 0; i < timerCount; i++) {
      service.scheduleBackgroundRetry({
        tableName: TEST_TABLE_NAME,
        operation: TEST_OPERATION,
        data: {[COLUMN.NODE_ID]: 'node-z'},
        sourceGroupId: 'g-1',
        targets: [{
          groupId: `${TEST_GROUP_ID}-${i}`,
          coordinatorNodeId: TEST_COORDINATOR_NODE_ID,
          address: TEST_ADDRESS,
        }],
        attempt: 1,
      });
    }

    assert.equal(
      service.backgroundRetryTimers.size,
      timerCount,
      `${timerCount} timers should be pending before stop()`,
    );

    service.stop();

    // After stop(), all timers should be cleared.
    assert.equal(
      service.backgroundRetryTimers.size,
      0,
      'All background retry timers should be cleared after stop()',
    );
  } finally {
    forceCleanupTimers(service);
    teardownConfig();
  }
  t.end();
});
