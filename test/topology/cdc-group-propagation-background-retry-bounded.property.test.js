/**
 * Bug Condition Exploration — Background Retry Bounded Termination
 *
 * Property 1 (Bug Condition A): For any CDC background retry where the
 * attempt number meets or exceeds the configured deliveryRetryMaxAttempts
 * and delivery continues to fail, scheduleBackgroundRetry SHALL NOT
 * schedule any further retry timers and SHALL log the exhaustion.
 *
 * On UNFIXED code this test MUST FAIL — failure confirms the bug exists.
 * scheduleBackgroundRetry does not check attempt against max and schedules
 * another timer unconditionally.
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
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
  CDC_GROUP_PROPAGATION_LOG_MSG,
} from '../../src/topology/cdc-group-propagation-constants.js';
import {
  CDCGroupPropagationService,
} from '../../src/topology/cdc-group-propagation-service.js';

const TEST_NODE_ID = 'node-a';
const TEST_TABLE_NAME = TABLES.NODES;
const TEST_OPERATION = 'UPDATE';
const TEST_GROUP_ID = 'g-2';
const TEST_COORDINATOR_NODE_ID = 'node-b';
const TEST_ADDRESS = 'node-b/message-group/mg-node-b';

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

test('Property 1 Bug Condition A: scheduleBackgroundRetry SHALL NOT ' +
  'schedule a timer when attempt >= deliveryRetryMaxAttempts ' +
  '(uses scheduleBackgroundRetry owner path)', async (t) => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({
        min: CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS +
          CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS,
        max: 100,
      }),
      async (attempt) => {
        setupConfig();
        const cache = createTopologyCache();
        const warnLogs = [];
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
          warn(message, context) {
            warnLogs.push({message, context});
          },
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

          // Expected behavior: no new timer should be added when
          // attempt >= deliveryRetryMaxAttempts.
          // On UNFIXED code this FAILS because
          // scheduleBackgroundRetry does not check attempt against
          // max — it schedules another timer unconditionally.
          const maxTotalAttempts =
            CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS +
            CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS;
          assert.equal(
            timerCountAfter,
            timerCountBefore,
            'scheduleBackgroundRetry should NOT schedule a ' +
            `timer when attempt=${attempt} >= ` +
            `maxTotalAttempts=${maxTotalAttempts} ` +
            `(MAX_ATTEMPTS=${CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS}` +
            ' + BACKGROUND_MAX_ATTEMPTS=' +
            `${CDC_GROUP_PROPAGATION_RETRY.BACKGROUND_MAX_ATTEMPTS}) ` +
            'but backgroundRetryTimers grew from ' +
            `${timerCountBefore} to ${timerCountAfter}`,
          );

          // Expected behavior: exhaustion should be logged.
          const exhaustionLog = warnLogs.find(
            (entry) => entry.message ===
              CDC_GROUP_PROPAGATION_LOG_MSG
                .DELIVERY_RETRY_EXHAUSTED,
          );
          assert.ok(
            exhaustionLog,
            'scheduleBackgroundRetry should log exhaustion ' +
            'when attempt >= max, but no exhaustion log ' +
            'was emitted',
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
