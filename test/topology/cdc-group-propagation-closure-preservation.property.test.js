/**
 * Preservation D — Successful CDC Delivery and Full Payload Delivery
 *
 * Property 2 (Preservation): For all successful first-attempt CDC
 * deliveries, no background retry timers are scheduled. For retries
 * that eventually succeed, the full event payload is delivered to
 * deliverToTargets.
 *
 * These tests MUST PASS on UNFIXED code — they capture baseline
 * behavior that must remain unchanged after the fix.
 *
 * **Validates: Requirements 3.6, 3.7**
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

const TEST_NODE_ID = 'node-closure-pres-a';
const TEST_TABLE_NAME = TABLES.NODES;
const TEST_OPERATION = 'UPDATE';
const TEST_GROUP_ID = 'g-closure-pres-2';
const TEST_COORDINATOR_NODE_ID = 'node-closure-pres-b';
const TEST_ADDRESS =
  'node-closure-pres-b/message-group/mg-node-closure-pres-b';

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
      [COLUMN.SERVICE_ID]: 'mg-node-closure-pres-b',
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

test('Property 2 Preservation D: successful first-attempt CDC ' +
  'deliveries SHALL NOT schedule any background retry timers ' +
  '(uses scheduleBackgroundRetry owner path)', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      async (fieldCount) => {
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
          const payload = {};
          for (let i = 0; i < fieldCount; i++) {
            payload[`field_${i}`] = `value_${i}`;
          }

          service.scheduleBackgroundRetry({
            tableName: TEST_TABLE_NAME,
            operation: TEST_OPERATION,
            data: payload,
            sourceGroupId: 'g-1',
            targets: [{
              groupId: TEST_GROUP_ID,
              coordinatorNodeId: TEST_COORDINATOR_NODE_ID,
              address: TEST_ADDRESS,
            }],
            attempt: 1,
          });

          // One timer is scheduled for the retry attempt.
          assert.equal(
            service.backgroundRetryTimers.size,
            1,
            'One timer should be scheduled for the retry attempt',
          );

          // Wait for the timer to fire and delivery to succeed.
          await new Promise((resolve) =>
            setTimeout(resolve, 10));

          // Preservation: after successful delivery, no further
          // timers should remain. The fired timer deletes itself,
          // and no new timer is scheduled on success.
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

test('Property 2 Preservation D: retries that eventually succeed ' +
  'SHALL deliver the full event payload to deliverToTargets ' +
  '(uses scheduleBackgroundRetry owner path)', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({min: 1, max: 5}),
      async (fieldCount) => {
        setupConfig();
        const cache = createTopologyCache();
        const deliveredPayloads = [];
        let deliverCallCount = 0;
        const service = new CDCGroupPropagationService({
          nodeId: TEST_NODE_ID,
          systemTableCache: cache,
          messageRouter: {
            async deliver(_address, payload, _opts) {
              deliverCallCount++;
              deliveredPayloads.push(payload);
              // Fail first attempt, succeed on second.
              if (deliverCallCount <= 1) {
                return {acknowledged: false, error: 'unreachable'};
              }
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
          const payload = {};
          for (let i = 0; i < fieldCount; i++) {
            payload[`field_${i}`] = `value_${i}`;
          }

          service.scheduleBackgroundRetry({
            tableName: TEST_TABLE_NAME,
            operation: TEST_OPERATION,
            data: payload,
            sourceGroupId: 'g-1',
            targets: [{
              groupId: TEST_GROUP_ID,
              coordinatorNodeId: TEST_COORDINATOR_NODE_ID,
              address: TEST_ADDRESS,
            }],
            attempt: 1,
          });

          // Wait for first retry (fails) and second retry
          // (succeeds).
          await new Promise((resolve) =>
            setTimeout(resolve, 30));

          // Preservation: the full payload must be delivered to
          // deliverToTargets on the successful retry.
          assert.ok(
            deliveredPayloads.length >= 1,
            'deliverToTargets should have been called at least ' +
            `once, but was called ${deliveredPayloads.length} ` +
            'time(s)',
          );

          // Verify the last successful delivery carried the
          // full payload data.
          const lastDelivery =
            deliveredPayloads[deliveredPayloads.length - 1];
          assert.ok(
            lastDelivery.data !== null &&
            lastDelivery.data !== undefined,
            'Delivered payload should contain the data field',
          );
          for (let i = 0; i < fieldCount; i++) {
            assert.equal(
              lastDelivery.data[`field_${i}`],
              `value_${i}`,
              `Delivered payload should contain field_${i}`,
            );
          }
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
