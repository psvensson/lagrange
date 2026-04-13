/**
 * Regression tests for periodic diagnostic emission during CDC
 * recovery in subscribeToCDCEvents().
 *
 * Validates Requirements 8.1, 8.2, 8.4:
 * - Diagnostic interval timer started at recovery start
 * - Structured log emitted every DIAGNOSTIC_INTERVAL_MS with
 *   subscription status, message group leader info, elapsed time
 * - Diagnostic timer cleared when recovery completes or times out
 *
 * Uses injected `sleep`, `now`, and fake timers to avoid real
 * delays and verify interval lifecycle.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {NodeJoiningService} from
  '../../src/bootstrap/node-joining-service.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {EventEmitter} from 'events';
import {
  JOINING_LOG_MSG,
  CDC_REESTABLISHMENT,
} from '../../src/bootstrap/node-joining-constants.js';
import {NUM} from '../../src/constants/index.js';

const TEST_NODE_ID = 'test-node-diag';
const TEST_NODE_ADDRESS = 'ws://localhost:9090';
const TEST_SEED_ADDRESS = 'http://localhost:8080';
const TEST_GROUP_ID = 'test-group-1';
const TEST_LEADER_NODE_ID = 'leader-node-1';

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

  const originalWarn = service.logger.warn.bind(service.logger);
  const originalInfo = service.logger.info.bind(service.logger);
  const originalDebug =
    service.logger.debug.bind(service.logger);
  service.logger.warn = (msg, payload) => {
    logs.push({level: 'warn', msg, payload});
    return originalWarn(msg, payload);
  };
  service.logger.info = (msg, payload) => {
    logs.push({level: 'info', msg, payload});
    return originalInfo(msg, payload);
  };
  service.logger.debug = (msg, payload) => {
    logs.push({level: 'debug', msg, payload});
    return originalDebug(msg, payload);
  };

  return {service, logs};
}

/**
 * Create a mock message group service with configurable leader
 * identity for diagnostic payload verification.
 *
 * @param {object} options
 * @returns {object} Mock message group service
 */
function createMockMessageGroupService(options = {}) {
  return {
    nodeId: options.nodeId || TEST_LEADER_NODE_ID,
    groupId: options.groupId || TEST_GROUP_ID,
    isLeaderReplica: () =>
      options.isLeader !== undefined ? options.isLeader : true,
    getLeaderId: () => options.leaderId || null,
  };
}

/**
 * Create a CDC integration service mock that delays success
 * until a specified number of attempts, allowing the diagnostic
 * interval to fire during the retry window.
 *
 * @param {number} failCount - Attempts that fail before success
 * @returns {{mock: EventEmitter}}
 */
function createDelayedSuccessCDC(failCount) {
  const emitter = new EventEmitter();
  let fullAttempts = NUM.ZERO;
  const firstEventType = 'insert';

  const originalOn = emitter.on.bind(emitter);
  const originalRemove = emitter.removeListener.bind(emitter);

  emitter.on = (event, handler) => {
    if (event === firstEventType) {
      fullAttempts++;
    }
    if (fullAttempts <= failCount) {
      throw new Error(
        `Subscription failed (attempt ${fullAttempts})`,
      );
    }
    return originalOn(event, handler);
  };

  emitter.removeListener = (event, handler) => {
    return originalRemove(event, handler);
  };

  return {mock: emitter};
}


test('diagnostic timer cleared after successful CDC ' +
  'subscription — no leaked intervals', async (t) => {
  initializeTestEnvironment();

  // Track setInterval/clearInterval calls to verify cleanup
  const intervalIds = [];
  const clearedIds = [];
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (fn, ms) => {
    const id = originalSetInterval(fn, ms);
    intervalIds.push(id);
    return id;
  };
  globalThis.clearInterval = (id) => {
    clearedIds.push(id);
    return originalClearInterval(id);
  };

  try {
    // Succeed immediately (zero failures)
    const emitter = new EventEmitter();
    const {service} = createServiceWithCapturingLogger();
    service.cdcIntegrationService = emitter;

    await service.subscribeToCDCEvents();

    // The diagnostic interval must have been created and
    // then cleared in the finally block.
    t.ok(
      intervalIds.length > NUM.ZERO,
      'at least one interval was created',
    );
    t.ok(
      clearedIds.length > NUM.ZERO,
      'at least one interval was cleared',
    );

    // Every interval created by subscribeToCDCEvents must
    // be cleared.
    for (const id of intervalIds) {
      t.ok(
        clearedIds.includes(id),
        `interval ${id} was cleared after success`,
      );
    }
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('diagnostic timer cleared after timeout — no ' +
  'leaked intervals on budget exhaustion', async (t) => {
  initializeTestEnvironment();

  const intervalIds = [];
  const clearedIds = [];
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (fn, ms) => {
    const id = originalSetInterval(fn, ms);
    intervalIds.push(id);
    return id;
  };
  globalThis.clearInterval = (id) => {
    clearedIds.push(id);
    return originalClearInterval(id);
  };

  try {
    // Time advances past timeout on every call
    const STEP_MS = 10000;
    let clockMs = NUM.ZERO;
    const advancingNow = () => {
      const current = clockMs;
      clockMs += STEP_MS;
      return current;
    };

    // Always-failing CDC mock
    const alwaysFailCDC = new EventEmitter();
    alwaysFailCDC.on = () => {
      throw new Error('Persistent failure');
    };
    alwaysFailCDC.removeListener = () => alwaysFailCDC;
    alwaysFailCDC.listenerCount = () => NUM.ZERO;

    const {service} = createServiceWithCapturingLogger({
      now: advancingNow,
    });
    service.cdcIntegrationService = alwaysFailCDC;

    await service.subscribeToCDCEvents();

    // Verify cleanup even on timeout path
    for (const id of intervalIds) {
      t.ok(
        clearedIds.includes(id),
        `interval ${id} was cleared after timeout`,
      );
    }
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});


test('diagnostic emission includes subscription status ' +
  'and message group leader info', async (t) => {
  initializeTestEnvironment();

  // Use fake timers so we can fire the diagnostic interval
  // synchronously without real delays.
  const intervalCallbacks = [];
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let nextId = NUM.ONE;

  globalThis.setInterval = (fn, ms) => {
    const id = nextId++;
    intervalCallbacks.push({id, fn, ms});
    return id;
  };
  globalThis.clearInterval = () => {};

  try {
    // CDC mock that fails twice then succeeds, giving the
    // diagnostic interval a window to fire.
    const FAIL_COUNT = 2;
    const {mock} = createDelayedSuccessCDC(FAIL_COUNT);

    const {service, logs} = createServiceWithCapturingLogger();
    service.cdcIntegrationService = mock;

    // Wire a mock message group service so leader info is
    // available in the diagnostic payload.
    const mockMgService = createMockMessageGroupService({
      nodeId: TEST_LEADER_NODE_ID,
      groupId: TEST_GROUP_ID,
      isLeader: true,
    });
    service.messageGroupServices = new Map([
      ['replica-1', mockMgService],
    ]);

    // Start subscription (will register interval then retry)
    const subscribePromise = service.subscribeToCDCEvents();

    // Manually fire the diagnostic interval callback to
    // simulate the timer firing during the retry window.
    for (const entry of intervalCallbacks) {
      entry.fn();
    }

    await subscribePromise;

    // Filter diagnostic logs
    const diagLogs = logs.filter(
      (l) => l.msg ===
        JOINING_LOG_MSG.CDC_RECOVERY_DIAGNOSTICS,
    );

    t.ok(
      diagLogs.length > NUM.ZERO,
      'at least one diagnostic log emitted',
    );

    const payload = diagLogs[NUM.ZERO].payload;

    // Verify required fields per Requirement 8.1, 8.2
    t.equal(
      payload.nodeId,
      TEST_NODE_ID,
      'diagnostic includes nodeId',
    );
    t.ok(
      payload.subscriptionStatus,
      'diagnostic includes subscriptionStatus',
    );
    t.ok(
      payload.subscriptionStatus.tables,
      'subscriptionStatus includes tables array',
    );
    t.ok(
      payload.subscriptionStatus.eventTypes,
      'subscriptionStatus includes eventTypes',
    );
    t.ok(
      typeof payload.elapsedMs === 'number',
      'diagnostic includes elapsedMs',
    );

    // Verify message group leader info
    t.ok(
      payload.messageGroupLeader,
      'diagnostic includes messageGroupLeader',
    );
    t.equal(
      payload.messageGroupLeader.nodeId,
      TEST_LEADER_NODE_ID,
      'leader info includes correct nodeId',
    );
    t.equal(
      payload.messageGroupLeader.groupId,
      TEST_GROUP_ID,
      'leader info includes correct groupId',
    );
    t.equal(
      payload.messageGroupLeader.isLeader,
      true,
      'leader info includes isLeader flag',
    );

    // Verify interval was registered with correct period
    t.ok(
      intervalCallbacks.length > NUM.ZERO,
      'setInterval was called',
    );
    t.equal(
      intervalCallbacks[NUM.ZERO].ms,
      CDC_REESTABLISHMENT.DIAGNOSTIC_INTERVAL_MS,
      'interval uses CDC_REESTABLISHMENT.DIAGNOSTIC_INTERVAL_MS',
    );
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('diagnostic emission shows null leader when no ' +
  'message group service available', async (t) => {
  initializeTestEnvironment();

  const intervalCallbacks = [];
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let nextId = NUM.ONE;

  globalThis.setInterval = (fn, ms) => {
    const id = nextId++;
    intervalCallbacks.push({id, fn, ms});
    return id;
  };
  globalThis.clearInterval = () => {};

  try {
    const FAIL_COUNT = 1;
    const {mock} = createDelayedSuccessCDC(FAIL_COUNT);

    const {service, logs} = createServiceWithCapturingLogger();
    service.cdcIntegrationService = mock;

    // No message group services — leader info should be null
    service.messageGroupServices = new Map();

    const subscribePromise = service.subscribeToCDCEvents();

    // Fire diagnostic interval
    for (const entry of intervalCallbacks) {
      entry.fn();
    }

    await subscribePromise;

    const diagLogs = logs.filter(
      (l) => l.msg ===
        JOINING_LOG_MSG.CDC_RECOVERY_DIAGNOSTICS,
    );

    t.ok(
      diagLogs.length > NUM.ZERO,
      'diagnostic log emitted even without leader',
    );

    const payload = diagLogs[NUM.ZERO].payload;
    t.equal(
      payload.messageGroupLeader,
      null,
      'messageGroupLeader is null when no service available',
    );
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('diagnostic timer cleared even when subscribeToCDCEvents ' +
  'throws due to missing integration service', async (t) => {
  initializeTestEnvironment();

  const intervalIds = [];
  const clearedIds = [];
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;

  globalThis.setInterval = (fn, ms) => {
    const id = originalSetInterval(fn, ms);
    intervalIds.push(id);
    return id;
  };
  globalThis.clearInterval = (id) => {
    clearedIds.push(id);
    return originalClearInterval(id);
  };

  try {
    const {service} = createServiceWithCapturingLogger();
    // cdcIntegrationService is null — method should throw
    // before reaching the interval setup, so no interval
    // should be created.

    let threw = false;
    try {
      await service.subscribeToCDCEvents();
    } catch (_e) {
      threw = true;
    }

    t.ok(threw, 'subscribeToCDCEvents throws without CDC service');

    // No interval should have been created since the early
    // guard throws before the interval is set up.
    // But if any were created, they must be cleared.
    for (const id of intervalIds) {
      t.ok(
        clearedIds.includes(id),
        `interval ${id} was cleared on error path`,
      );
    }
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
