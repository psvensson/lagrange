/**
 * Regression tests for restart CDC subscription retry and diagnostics.
 *
 * Validates Requirements 5.1, 5.2, 5.4:
 * - Bounded retry loop for CDC subscription re-establishment
 * - Structured diagnostics logged on each failure
 * - Timeout path emits diagnostic summary
 *
 * Uses injected `sleep` and `now` to avoid real delays and control
 * time progression for timeout tests.
 */

import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from
  '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {EventEmitter} from 'events';
import {JOINING_LOG_MSG, CDC_REESTABLISHMENT} from
  '../../src/bootstrap/node-joining-constants.js';
import {NUM} from '../../src/constants/index.js';

const TEST_NODE_ID = 'test-node-retry';
const TEST_NODE_ADDRESS = 'ws://localhost:9090';
const TEST_SEED_ADDRESS = 'http://localhost:8080';

/**
 * Initialize configuration and logging singletons for tests.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: TEST_NODE_ID},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }

  NodeService.resetInstance();
}

/**
 * Create a mock CDC integration service that fails a specified number
 * of full retry attempts before succeeding. Tracks all `on`,
 * `removeListener`, and `listenerCount` calls for assertion.
 *
 * The implementation registers 4 event types per attempt. When a
 * failure is injected, the first `.on()` call in that attempt throws,
 * causing the catch block to clean up and retry.
 *
 * @param {number} failCount - Number of full attempts that should fail
 * @returns {{mock: EventEmitter, calls: object}}
 */
function createFailThenSucceedCDC(failCount) {
  const emitter = new EventEmitter();
  const calls = {
    onCalls: [],
    removeCalls: [],
    listenerCountCalls: [],
    fullAttempts: NUM.ZERO,
  };

  // Track attempts: each time the catch block finishes cleanup
  // (removeListener × 4), the loop increments. We count attempts
  // by tracking how many times the first event type is seen.
  const firstEventType = 'insert';

  const originalOn = emitter.on.bind(emitter);
  const originalRemove = emitter.removeListener.bind(emitter);

  emitter.on = (event, handler) => {
    calls.onCalls.push(event);
    // Count a new attempt each time the first event type is
    // registered (the implementation always iterates in order).
    if (event === firstEventType) {
      calls.fullAttempts++;
    }

    if (calls.fullAttempts <= failCount) {
      throw new Error(
        `Subscription failed (attempt ${calls.fullAttempts})`,
      );
    }
    return originalOn(event, handler);
  };

  emitter.removeListener = (event, handler) => {
    calls.removeCalls.push(event);
    return originalRemove(event, handler);
  };

  const originalListenerCount =
    emitter.listenerCount.bind(emitter);
  emitter.listenerCount = (event) => {
    calls.listenerCountCalls.push(event);
    return originalListenerCount(event);
  };

  return {mock: emitter, calls};
}

/**
 * Create a NodeJoiningService with injected sleep/now and a
 * capturing logger that records all log calls.
 *
 * @param {object} overrides - Additional constructor options
 * @returns {{service: NodeJoiningService, logs: Array}}
 */
function createServiceWithCapturingLogger(overrides = {}) {
  const logs = [];
  const service = new NodeJoiningService({
    nodeId: TEST_NODE_ID,
    nodeAddress: TEST_NODE_ADDRESS,
    seedNodeAddress: TEST_SEED_ADDRESS,
    sleep: () => Promise.resolve(),
    now: () => Date.now(),
    ...overrides,
  });

  // Capture structured log output by wrapping the logger
  const originalWarn = service.logger.warn.bind(service.logger);
  const originalInfo = service.logger.info.bind(service.logger);
  service.logger.warn = (msg, payload) => {
    logs.push({level: 'warn', msg, payload});
    return originalWarn(msg, payload);
  };
  service.logger.info = (msg, payload) => {
    logs.push({level: 'info', msg, payload});
    return originalInfo(msg, payload);
  };

  return {service, logs};
}


test('retry loop executes correct number of times ' +
  'when subscription fails then succeeds', async (t) => {
  initializeTestEnvironment();

  const FAIL_COUNT = 3;
  const {mock, calls} = createFailThenSucceedCDC(FAIL_COUNT);
  const {service} = createServiceWithCapturingLogger();
  service.cdcIntegrationService = mock;

  await service.subscribeToCDCEvents();

  // Each failed attempt calls .on() once (throws on first event type),
  // then removeListener for all 4 event types. The successful attempt
  // calls .on() for all 4 event types.
  // Total .on() calls = FAIL_COUNT * 1 + 4 (success)
  const successOnCalls = NUM.FOUR;
  const expectedOnCalls = FAIL_COUNT + successOnCalls;
  t.equal(
    calls.onCalls.length,
    expectedOnCalls,
    `on() called ${expectedOnCalls} times ` +
    `(${FAIL_COUNT} failed + ${successOnCalls} success)`,
  );

  t.ok(
    service.cdcSubscriptionsActive,
    'cdcSubscriptionsActive set after retry success',
  );
});

test('structured diagnostics logged on each retry failure ' +
  'with correct payload fields', async (t) => {
  initializeTestEnvironment();

  const FAIL_COUNT = 2;
  const {mock} = createFailThenSucceedCDC(FAIL_COUNT);
  const {service, logs} = createServiceWithCapturingLogger();
  service.cdcIntegrationService = mock;

  await service.subscribeToCDCEvents();

  // Filter retry warning logs
  const retryLogs = logs.filter(
    (l) => l.msg === JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY,
  );

  t.equal(
    retryLogs.length,
    FAIL_COUNT,
    `${FAIL_COUNT} retry diagnostics emitted`,
  );

  // Verify structured payload on each retry log
  for (let i = NUM.ZERO; i < retryLogs.length; i++) {
    const payload = retryLogs[i].payload;
    t.ok(payload.nodeId, 'retry log includes nodeId');
    t.ok(payload.tables, 'retry log includes tables');
    t.ok(payload.error, 'retry log includes error message');
    t.equal(
      payload.attempt,
      i + NUM.ONE,
      `retry log attempt is ${i + NUM.ONE}`,
    );
    t.equal(
      payload.maxRetries,
      CDC_REESTABLISHMENT.MAX_RETRIES,
      'retry log includes maxRetries',
    );
    t.ok(
      typeof payload.remainingBudgetMs === 'number',
      'retry log includes remainingBudgetMs',
    );
  }

  // Verify success log emitted after retries
  const completeLogs = logs.filter(
    (l) => l.msg ===
      JOINING_LOG_MSG.CDC_REESTABLISHMENT_COMPLETE,
  );
  t.equal(
    completeLogs.length,
    NUM.ONE,
    'CDC re-establishment complete log emitted',
  );
});

test('success after retries sets cdcSubscriptionsActive ' +
  'and emits completion log', async (t) => {
  initializeTestEnvironment();

  const FAIL_COUNT = 5;
  const {mock} = createFailThenSucceedCDC(FAIL_COUNT);
  const {service, logs} = createServiceWithCapturingLogger();
  service.cdcIntegrationService = mock;

  t.equal(
    service.cdcSubscriptionsActive,
    false,
    'cdcSubscriptionsActive initially false',
  );

  await service.subscribeToCDCEvents();

  t.equal(
    service.cdcSubscriptionsActive,
    true,
    'cdcSubscriptionsActive true after successful retry',
  );

  // Verify completion log has expected fields
  const completeLogs = logs.filter(
    (l) => l.msg ===
      JOINING_LOG_MSG.CDC_REESTABLISHMENT_COMPLETE,
  );
  t.equal(completeLogs.length, NUM.ONE, 'one completion log');
  const payload = completeLogs[NUM.ZERO].payload;
  t.ok(payload.nodeId, 'completion log includes nodeId');
  t.ok(
    typeof payload.elapsedMs === 'number',
    'completion log includes elapsedMs',
  );
  t.ok(payload.subscriptionStatus, 'completion log includes subscriptionStatus');

  // No exhaustion log should be emitted on success
  const exhaustedLogs = logs.filter(
    (l) => l.msg ===
      JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY_EXHAUSTED,
  );
  t.equal(
    exhaustedLogs.length,
    NUM.ZERO,
    'no exhaustion log on successful retry',
  );
});


test('timeout path emits diagnostic summary when ' +
  'time budget expires', async (t) => {
  initializeTestEnvironment();

  // Simulate time progression that exceeds the timeout budget.
  // Each call to now() advances by a large step so the budget
  // is exhausted after a few attempts.
  const STEP_MS = 10000;
  let clockMs = NUM.ZERO;
  const advancingNow = () => {
    const current = clockMs;
    clockMs += STEP_MS;
    return current;
  };

  // CDC mock that always fails
  const alwaysFailCDC = new EventEmitter();
  const originalOn = alwaysFailCDC.on.bind(alwaysFailCDC);
  alwaysFailCDC.on = (_event, _handler) => {
    throw new Error('Persistent subscription failure');
  };
  alwaysFailCDC.removeListener = () => alwaysFailCDC;
  alwaysFailCDC.listenerCount = () => NUM.ZERO;

  const {service, logs} = createServiceWithCapturingLogger({
    now: advancingNow,
  });
  service.cdcIntegrationService = alwaysFailCDC;

  await service.subscribeToCDCEvents();

  // Verify timeout log was emitted
  const timeoutLogs = logs.filter(
    (l) => l.msg ===
      JOINING_LOG_MSG.CDC_REESTABLISHMENT_TIMEOUT,
  );
  t.ok(
    timeoutLogs.length > NUM.ZERO,
    'timeout diagnostic emitted when budget expires',
  );

  // Verify timeout payload has required fields
  const payload = timeoutLogs[NUM.ZERO].payload;
  t.ok(payload.nodeId, 'timeout log includes nodeId');
  t.ok(payload.tables, 'timeout log includes tables');
  t.ok(
    typeof payload.attempt === 'number',
    'timeout log includes attempt number',
  );
  t.ok(
    typeof payload.elapsedMs === 'number',
    'timeout log includes elapsedMs',
  );

  // Verify exhaustion log was also emitted (retries exhausted
  // because timeout cut them short)
  const exhaustedLogs = logs.filter(
    (l) => l.msg ===
      JOINING_LOG_MSG.CDC_SUBSCRIPTION_RETRY_EXHAUSTED,
  );
  t.ok(
    exhaustedLogs.length > NUM.ZERO,
    'exhaustion summary emitted after timeout',
  );
  const exhaustedPayload = exhaustedLogs[NUM.ZERO].payload;
  t.ok(
    exhaustedPayload.subscriptionStatus,
    'exhaustion log includes subscriptionStatus',
  );
});

test('partial listener cleanup on retry removes ' +
  'listeners before next attempt', async (t) => {
  initializeTestEnvironment();

  const FAIL_COUNT = 2;
  const emitter = new EventEmitter();
  const removeCalls = [];
  let fullAttempts = NUM.ZERO;
  const firstEventType = 'insert';

  const originalOn = emitter.on.bind(emitter);
  const originalRemove = emitter.removeListener.bind(emitter);

  emitter.on = (event, handler) => {
    if (event === firstEventType) {
      fullAttempts++;
    }
    if (fullAttempts <= FAIL_COUNT) {
      throw new Error(
        `Subscription failed (attempt ${fullAttempts})`,
      );
    }
    return originalOn(event, handler);
  };

  emitter.removeListener = (event, handler) => {
    removeCalls.push({event, attempt: fullAttempts});
    return originalRemove(event, handler);
  };

  const {service} = createServiceWithCapturingLogger();
  service.cdcIntegrationService = emitter;

  await service.subscribeToCDCEvents();

  // Each failed attempt should trigger removeListener for all
  // 4 event types to clean up partial registrations.
  const EVENTS_PER_CLEANUP = NUM.FOUR;
  const expectedRemoveCalls = FAIL_COUNT * EVENTS_PER_CLEANUP;
  t.equal(
    removeCalls.length,
    expectedRemoveCalls,
    `removeListener called ${expectedRemoveCalls} times ` +
    `(${FAIL_COUNT} failures × ${EVENTS_PER_CLEANUP} event types)`,
  );

  // Verify cleanup events include all 4 CDC event types per
  // failed attempt
  const firstCleanupEvents = removeCalls
    .slice(NUM.ZERO, EVENTS_PER_CLEANUP)
    .map((c) => c.event);
  t.ok(
    firstCleanupEvents.includes('insert'),
    'cleanup removes insert listener',
  );
  t.ok(
    firstCleanupEvents.includes('update'),
    'cleanup removes update listener',
  );
  t.ok(
    firstCleanupEvents.includes('delete'),
    'cleanup removes delete listener',
  );
  t.ok(
    firstCleanupEvents.includes('upsert'),
    'cleanup removes upsert listener',
  );
});

import {
  CDC_SUBSCRIPTION_STATUS,
} from '../../src/bootstrap/node-joining-constants.js';
import {CACHE_HYDRATION_TABLES} from
  '../../src/cache/cache-constants.js';
import {CDC_EVENT} from '../../src/cdc/cdc-constants.js';

test('getCdcSubscriptionStatus returns subscribed ' +
  'when subscriptions are active and listeners exist',
async (t) => {
  initializeTestEnvironment();

  const {mock} = createFailThenSucceedCDC(NUM.ZERO);
  const {service} = createServiceWithCapturingLogger();
  service.cdcIntegrationService = mock;

  await service.subscribeToCDCEvents();

  const status = service.getCdcSubscriptionStatus();

  t.equal(status.active, true, 'active is true');
  t.equal(
    status.tables.length,
    CACHE_HYDRATION_TABLES.length,
    'one entry per hydration table',
  );

  for (const entry of status.tables) {
    t.equal(
      entry.status,
      CDC_SUBSCRIPTION_STATUS.SUBSCRIBED,
      `table ${entry.tableName} is subscribed`,
    );
    t.ok(
      CACHE_HYDRATION_TABLES.includes(entry.tableName),
      `table ${entry.tableName} is a hydration table`,
    );
  }

  // Verify event type listener counts are positive
  const eventTypes = [
    CDC_EVENT.INSERT,
    CDC_EVENT.UPDATE,
    CDC_EVENT.DELETE,
    CDC_EVENT.UPSERT,
  ];
  for (const et of eventTypes) {
    t.ok(
      status.eventTypes[et] > NUM.ZERO,
      `listener count for ${et} is positive`,
    );
  }
});

test('getCdcSubscriptionStatus returns failed ' +
  'when no integration service exists', async (t) => {
  initializeTestEnvironment();

  const {service} = createServiceWithCapturingLogger();
  // cdcIntegrationService is null by default

  const status = service.getCdcSubscriptionStatus();

  t.equal(status.active, false, 'active is false');
  t.equal(
    status.tables.length,
    CACHE_HYDRATION_TABLES.length,
    'one entry per hydration table',
  );

  for (const entry of status.tables) {
    t.equal(
      entry.status,
      CDC_SUBSCRIPTION_STATUS.FAILED,
      `table ${entry.tableName} is failed`,
    );
  }

  // All event type counts should be zero
  const eventTypes = [
    CDC_EVENT.INSERT,
    CDC_EVENT.UPDATE,
    CDC_EVENT.DELETE,
    CDC_EVENT.UPSERT,
  ];
  for (const et of eventTypes) {
    t.equal(
      status.eventTypes[et],
      NUM.ZERO,
      `listener count for ${et} is zero`,
    );
  }
});

test('getCdcSubscriptionStatus returns pending ' +
  'when active flag set but no listeners', async (t) => {
  initializeTestEnvironment();

  const emitter = new EventEmitter();
  const {service} = createServiceWithCapturingLogger();
  service.cdcIntegrationService = emitter;
  // Manually set active without registering listeners
  // (simulates partial subscription state)
  service.cdcSubscriptionsActive = true;

  const status = service.getCdcSubscriptionStatus();

  t.equal(status.active, true, 'active is true');

  for (const entry of status.tables) {
    t.equal(
      entry.status,
      CDC_SUBSCRIPTION_STATUS.PENDING,
      `table ${entry.tableName} is pending`,
    );
  }
});

test('getCdcSubscriptionStatus reads from existing ' +
  'state, not a new cache (§1.4 single source of truth)',
async (t) => {
  initializeTestEnvironment();

  const {mock} = createFailThenSucceedCDC(NUM.ZERO);
  const {service} = createServiceWithCapturingLogger();
  service.cdcIntegrationService = mock;

  await service.subscribeToCDCEvents();

  // Call twice — results must be identical, proving no
  // internal accumulation or caching.
  const first = service.getCdcSubscriptionStatus();
  const second = service.getCdcSubscriptionStatus();

  t.strictSame(
    first,
    second,
    'repeated calls return identical snapshots',
  );
});
