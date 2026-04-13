/**
 * Property Test: Adaptive threshold increases on flapping
 * Feature: system-architecture-consolidation,
 *   Property 9: Adaptive threshold increases on flapping
 *
 * **Validates: Requirements 4.6**
 *
 * *For any* node that fails repeatedly within the flapping window
 * (exceeding the flapping threshold), the FailureDetector's
 * effective failure threshold shall increase, up to the configured
 * maximum.
 */
// @ts-nocheck


import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {FailureDetector} from '../../src/node/failure-detector.js';
import {NODE_STATE} from '../../src/constants/index.js';
import {
  FAILURE_DETECTOR_DEFAULT,
  FAILURE_DETECTOR_SQL,
} from '../../src/node/node-constants.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createMockMutationGateway} from
  './failure-detector-test-helpers.js';

/**
 * The detector's own node ID — always skipped during health checks.
 * @type {string}
 */
const SELF_NODE_ID = 'self-node';

/**
 * Target node ID used for flapping tests.
 * @type {string}
 */
const TARGET_NODE_ID = 'flapping-node';

/**
 * Number of checkNodeHealth calls needed to trigger the first
 * threshold increase. checkFlapping counts prior failures before
 * recording the current one, so flappingThreshold prior failures
 * must exist before the check passes. This means we need
 * flappingThreshold + 1 total calls.
 * @type {number}
 */
const CALLS_FOR_FIRST_INCREASE =
  FAILURE_DETECTOR_DEFAULT.FLAPPING_THRESHOLD + 1;

/**
 * Heartbeat age that exceeds the adaptive max threshold, ensuring
 * the node is always detected as failed regardless of how much
 * the threshold increases.
 * @type {number}
 */
const HEARTBEAT_AGE_BEYOND_MAX =
  FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MAX_THRESHOLD_MS + 1000;

/**
 * Create a mock CDC integration service that tracks all write
 * operations.
 * @return {Object} Mock CDC service with an operations array.
 */
function createMockCDCService() {
  const operations = [];
  return {
    operations,
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({tableName, whereClause, data});
      return {success: true};
    },
  };
}

/**
 * Create a mock SQL query engine that always returns the target
 * node as SUSPECTED with a stale heartbeat, and empty service
 * results. This ensures each checkNodeHealth call triggers
 * handleNodeFailure → checkFlapping.
 * @param {number} heartbeatAge - Age of the heartbeat in ms.
 * @return {Object} Mock SQL query engine.
 */
function createMockSqlQueryEngine(heartbeatAge) {
  const now = Date.now();
  return {
    async executeQuery(sql, _params = []) {
      if (sql === FAILURE_DETECTOR_SQL.SELECT_ALL_NODES) {
        return {
          rows: [{
            node_id: TARGET_NODE_ID,
            status: NODE_STATE.SUSPECTED,
            last_heartbeat: now - heartbeatAge,
          }],
          success: true,
        };
      }
      return {rows: [], success: true};
    },
  };
}

/**
 * Create a FailureDetector wired with mock dependencies.
 * @param {number} heartbeatAge - Age of the heartbeat in ms.
 * @return {{detector: FailureDetector, mockCDC: Object}}
 */
function createDetector(heartbeatAge) {
  const mockCDC = createMockCDCService();
  const mockEngine = createMockSqlQueryEngine(heartbeatAge);

  const detector = new FailureDetector({
    nodeId: SELF_NODE_ID,
    sqlQueryEngine: mockEngine,
    cdcIntegrationService: mockCDC,
    controlPlaneSystemTableGateway:
      createMockMutationGateway(mockEngine, mockCDC),
  });
  detector.initialize();

  return {detector, mockCDC};
}

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: SELF_NODE_ID}});
  const logger = LoggingService.getInstance();
  logger.initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

/**
 * Property: For any number of repeated failures exceeding
 * the flapping threshold, the effective failure threshold
 * increases from its initial value.
 *
 * checkFlapping counts prior failures before recording the
 * current one, so the first increase requires
 * (flappingThreshold + 1) total calls.
 */
test(
  'Property 9a: threshold increases after flapping',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({
          min: CALLS_FOR_FIRST_INCREASE,
          max: CALLS_FOR_FIRST_INCREASE + 5,
        }),
        async (failureCount) => {
          const {detector} = createDetector(
            HEARTBEAT_AGE_BEYOND_MAX,
          );
          const initialThreshold =
            detector.getFailureThreshold();

          for (let i = 0; i < failureCount; i++) {
            await detector.checkNodeHealth();
          }

          const finalThreshold =
            detector.getFailureThreshold();

          // After enough failures, threshold must increase.
          return finalThreshold > initialThreshold;
        },
      ),
      {numRuns: 10},
    );

    t.pass(
      'threshold increases after repeated failures ' +
      'exceed flapping threshold',
    );
  },
);

/**
 * Property: For any number of failures below the count
 * needed to trigger flapping, the effective failure threshold
 * remains at its initial value.
 */
test(
  'Property 9b: threshold unchanged below flapping count',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({
          min: 1,
          max: FAILURE_DETECTOR_DEFAULT.FLAPPING_THRESHOLD,
        }),
        async (failureCount) => {
          const {detector} = createDetector(
            HEARTBEAT_AGE_BEYOND_MAX,
          );
          const initialThreshold =
            detector.getFailureThreshold();

          for (let i = 0; i < failureCount; i++) {
            await detector.checkNodeHealth();
          }

          const finalThreshold =
            detector.getFailureThreshold();

          // Below flapping trigger, threshold must not change.
          return finalThreshold === initialThreshold;
        },
      ),
      {numRuns: 10},
    );

    t.pass(
      'threshold unchanged when failures are below ' +
      'flapping trigger count',
    );
  },
);

/**
 * Property: For any sequence of repeated flapping failures,
 * the effective failure threshold never exceeds the configured
 * adaptive maximum.
 */
test(
  'Property 9c: threshold never exceeds adaptive maximum',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 5, max: 15}),
        async (failureCount) => {
          const maxThreshold =
            FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MAX_THRESHOLD_MS;

          const {detector} = createDetector(
            HEARTBEAT_AGE_BEYOND_MAX,
          );

          for (let i = 0; i < failureCount; i++) {
            await detector.checkNodeHealth();
          }

          const finalThreshold =
            detector.getFailureThreshold();

          // Threshold must never exceed the configured max.
          return finalThreshold <= maxThreshold;
        },
      ),
      {numRuns: 10},
    );

    t.pass(
      'threshold never exceeds adaptive maximum ' +
      'regardless of failure count',
    );
  },
);

/**
 * Property: For any number of flapping cycles beyond the
 * trigger point, the threshold increases by the configured
 * multiplier each time, capped at the maximum.
 *
 * After CALLS_FOR_FIRST_INCREASE calls, each additional
 * call triggers another increase since the accumulated
 * failure count stays above the flapping threshold.
 */
test(
  'Property 9d: threshold increases by multiplier per cycle',
  async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 5}),
        async (extraCalls) => {
          const baseThreshold =
            FAILURE_DETECTOR_DEFAULT.FAILURE_THRESHOLD_MS;
          const maxThreshold =
            FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MAX_THRESHOLD_MS;
          const multiplier =
            FAILURE_DETECTOR_DEFAULT.ADAPTIVE_MULTIPLIER;

          const {detector} = createDetector(
            HEARTBEAT_AGE_BEYOND_MAX,
          );

          const totalCalls =
            CALLS_FOR_FIRST_INCREASE + extraCalls;

          for (let i = 0; i < totalCalls; i++) {
            await detector.checkNodeHealth();
          }

          // Calculate expected threshold:
          // The first increase happens at call
          // CALLS_FOR_FIRST_INCREASE. Each subsequent call
          // also triggers an increase since the accumulated
          // count stays above the threshold.
          // Total increases = 1 (first) + extraCalls.
          const totalIncreases = 1 + extraCalls;
          let expected = baseThreshold;
          for (let i = 0; i < totalIncreases; i++) {
            expected = Math.min(
              expected * multiplier,
              maxThreshold,
            );
          }

          const finalThreshold =
            detector.getFailureThreshold();

          // Allow small floating point tolerance.
          return Math.abs(finalThreshold - expected) < 1;
        },
      ),
      {numRuns: 10},
    );

    t.pass(
      'threshold increases by multiplier on each ' +
      'flapping detection cycle',
    );
  },
);
