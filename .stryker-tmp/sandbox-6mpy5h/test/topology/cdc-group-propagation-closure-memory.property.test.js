/**
 * Bug Condition Exploration — CDC Closure Memory Retention
 *
 * Property 3 (Bug Condition D): For any call to scheduleBackgroundRetry
 * where a CDC delivery has failed, the fixed function SHALL NOT retain
 * a reference to the full options.data payload in the setTimeout
 * closure. Only minimal metadata fields shall be captured, and the
 * payload reference shall be released from the closure scope.
 *
 * On UNFIXED code this test MUST FAIL — failure confirms the bug exists.
 * scheduleBackgroundRetry captures the full options object in the
 * setTimeout closure, keeping the CDC event payload alive in memory
 * until the timer fires.
 *
 * **Validates: Requirements 1.5, 2.5**
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

const TEST_NODE_ID = 'node-closure-mem-a';
const TEST_TABLE_NAME = TABLES.NODES;
const TEST_OPERATION = 'UPDATE';
const TEST_GROUP_ID = 'g-closure-2';
const TEST_COORDINATOR_NODE_ID = 'node-closure-mem-b';
const TEST_ADDRESS = 'node-closure-mem-b/message-group/mg-node-b';

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
    payload[`field_${i}`] = `value_${'x'.repeat(100)}_${i}`;
  }
  return payload;
}

test('Property 3 Bug Condition D: ' +
  'scheduleBackgroundRetry closure SHALL NOT retain reference to ' +
  'the full options.data payload object ' +
  '(uses scheduleBackgroundRetry owner path)', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 5, max: 20}),
      async (fieldCount) => {
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
          const largePayload = buildLargePayload(fieldCount);

          // Create a Proxy-wrapped options object that tracks
          // property access. After scheduleBackgroundRetry
          // destructures and nulls the parameter, the closure
          // should NOT access the original options object.
          let postCallAccessCount = 0;
          let callReturned = false;
          const optionsObj = new Proxy({
            tableName: TEST_TABLE_NAME,
            operation: TEST_OPERATION,
            data: largePayload,
            sourceGroupId: 'g-1',
            targets: [{
              groupId: TEST_GROUP_ID,
              coordinatorNodeId: TEST_COORDINATOR_NODE_ID,
              address: TEST_ADDRESS,
            }],
            attempt: 1,
          }, {
            get(target, prop) {
              if (callReturned) {
                postCallAccessCount++;
              }
              return target[prop];
            },
          });

          service.scheduleBackgroundRetry(optionsObj);
          callReturned = true;

          // Let the setTimeout fire so the closure executes.
          await new Promise((resolve) =>
            setTimeout(resolve, 10));

          // Expected: after the fix, the closure uses local
          // destructured variables, NOT the options object.
          // The options parameter is nulled after destructuring,
          // so the closure never accesses the proxy again.
          //
          // On UNFIXED code this FAILS because the closure
          // references options.tableName, options.data, etc.
          // directly, causing proxy get traps to fire.
          assert.equal(
            postCallAccessCount,
            0,
            `scheduleBackgroundRetry closure should NOT access ` +
            `the original options object after the call ` +
            `returns (payload with ${fieldCount} fields), ` +
            `but ${postCallAccessCount} property access(es) ` +
            `were detected via the closure`,
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
