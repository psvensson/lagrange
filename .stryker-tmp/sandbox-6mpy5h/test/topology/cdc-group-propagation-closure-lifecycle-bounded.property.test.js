/**
 * Closure Lifecycle Bounded — Background Retry Timer Cleanup
 *
 * Proves that scheduleBackgroundRetry closures are bounded: after all
 * retry timers fire and exhaust their attempts, backgroundRetryTimers
 * is empty and no closure references survive.
 *
 * This is a regression test for Bug D (CDC closure memory retention).
 * The fix destructures options into local variables and nulls the
 * parameter, so closures hold only the fields they need. This test
 * proves the lifecycle is finite: schedule N retries with large
 * payloads, let them all fire until exhaustion, verify zero timers
 * remain.
 */
// @ts-nocheck


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

const TEST_NODE_ID = 'node-lifecycle-a';
const TEST_TABLE_NAME = TABLES.NODES;
const TEST_OPERATION = 'UPDATE';
const TEST_GROUP_ID = 'g-lifecycle-2';
const TEST_COORDINATOR_NODE_ID = 'node-lifecycle-b';
const TEST_ADDRESS = 'node-lifecycle-b/message-group/mg-node-b';
const LARGE_PAYLOAD_FIELD_VALUE_LENGTH = 200;
const TIMER_SETTLE_DELAY_MS = 50;
const MIN_CONCURRENT_RETRIES = 2;
const MAX_CONCURRENT_RETRIES = 6;
const MIN_PAYLOAD_FIELDS = 10;
const MAX_PAYLOAD_FIELDS = 30;

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
      [COLUMN.SERVICE_ID]: 'mg-node-b',
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

/**
 * Build a large data payload object for testing memory retention.
 * @param {number} fieldCount - Number of fields to include.
 * @return {Object} Large payload object.
 */
function buildLargePayload(fieldCount) {
  const payload = {};
  for (let i = 0; i < fieldCount; i++) {
    payload[`field_${i}`] =
      `value_${'x'.repeat(LARGE_PAYLOAD_FIELD_VALUE_LENGTH)}_${i}`;
  }
  return payload;
}

/**
 * Create a service with 1ms retry delays and always-failing delivery.
 * @return {CDCGroupPropagationService}
 */
function createServiceWithFailingDelivery() {
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
  return service;
}

test('Closure lifecycle bounded: N concurrent ' +
  'scheduleBackgroundRetry calls with large payloads exhaust ' +
  'all attempts and leave zero timers ' +
  '(uses scheduleBackgroundRetry owner path)', async (t) => {
  const maxTotalAttempts =
    CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS +
    CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS;

  await fc.assert(
    fc.asyncProperty(
      fc.integer({
        min: MIN_CONCURRENT_RETRIES,
        max: MAX_CONCURRENT_RETRIES,
      }),
      fc.integer({
        min: MIN_PAYLOAD_FIELDS,
        max: MAX_PAYLOAD_FIELDS,
      }),
      async (retryCount, fieldCount) => {
        setupConfig();
        const service = createServiceWithFailingDelivery();

        try {
          // Schedule N concurrent background retries with large
          // payloads, each starting at attempt 1 so they have
          // the full retry budget to exhaust.
          for (let i = 0; i < retryCount; i++) {
            const largePayload = buildLargePayload(fieldCount);
            service.scheduleBackgroundRetry({
              tableName: TEST_TABLE_NAME,
              operation: TEST_OPERATION,
              data: largePayload,
              sourceGroupId: `g-${i}`,
              targets: [{
                groupId: TEST_GROUP_ID,
                coordinatorNodeId: TEST_COORDINATOR_NODE_ID,
                address: TEST_ADDRESS,
              }],
              attempt: 1,
            });
          }

          // All N calls should have scheduled timers.
          assert.ok(
            service.backgroundRetryTimers.size > 0,
            'Expected at least one timer after scheduling ' +
            `${retryCount} retries`,
          );

          // Let all timers fire and cascade through their
          // retry chains until exhaustion. Each retry chain
          // has (maxTotalAttempts - 1) hops with 1ms delays.
          const settleIterations = maxTotalAttempts + 1;
          for (let i = 0; i < settleIterations; i++) {
            await new Promise((resolve) =>
              setTimeout(resolve, TIMER_SETTLE_DELAY_MS));
          }

          // After exhaustion, all timer chains should have
          // terminated and cleaned up.
          assert.equal(
            service.backgroundRetryTimers.size,
            0,
            'backgroundRetryTimers should be empty after ' +
            `all ${retryCount} retry chains exhaust ` +
            `${maxTotalAttempts} total attempts, but ` +
            `${service.backgroundRetryTimers.size} timers ` +
            'remain',
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
