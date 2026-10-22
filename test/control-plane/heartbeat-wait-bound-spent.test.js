/**
 * Spent-wait witness for the heartbeat owner: the per-attempt watchdog and
 * the node-state reporter timeout each log exactly one wait_bound_spent ERROR
 * on expiry (with the last observed attempt / publication state), none on
 * normal completion, and keep their post-expiry behaviour unchanged.
 */

import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  createMockCache,
  createMockCdc,
  HeartbeatService,
  initEnv,
} from './heartbeat-memory-trend-test-helpers.js';


function createManualTimers() {
  const handles = [];
  return {
    handles,
    setTimeoutFn: (callback, delayMs) => {
      const handle = {callback, delayMs, cleared: false, unref() {}};
      handles.push(handle);
      return handle;
    },
    clearTimeoutFn: (handle) => {
      if (handle) handle.cleared = true;
    },
  };
}

function createService(nodeId, timers, clock, extra = {}) {
  const service = new HeartbeatService({
    nodeId,
    nodeAddress: '10.0.0.71:8080',
    cdcIntegrationService: createMockCdc(),
    systemTableCache: createMockCache(),
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    setIntervalFn: () => ({unref() {}}),
    clearIntervalFn: () => {},
    now: () => clock.nowMs,
    heartbeatAttemptTimeoutMs: 40,
    ...extra,
  });
  const capture = captureLogger();
  service.logger = capture.logger;
  return {service, capture};
}

function resetEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

test('heartbeat attempt watchdog expiry logs one wait_bound_spent ERROR and ' +
  'still records the attempt_timeout failure', (t) => {
  initEnv();
  const timers = createManualTimers();
  const clock = {nowMs: 1000};
  const {service, capture} = createService('node-hb-spent-a', timers, clock);
  try {
    const attempt = service.beginHeartbeatAttempt();
    attempt.stage = 'publish';
    t.equal(timers.handles.length, 1, 'one watchdog armed');
    clock.nowMs = 1040;
    timers.handles[0].callback();

    const spent = capture.spent();
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    t.equal(capture.errors().length, 1, 'no other ERROR line');
    const context = spent[0].context;
    t.equal(context.wait, 'heartbeatAttemptTimeoutMs');
    t.equal(context.boundMs, 40);
    t.equal(context.elapsedMs, 40, 'elapsed measured with the injected clock');
    t.equal(context.lastObserved.attemptStage, 'publish',
      'last observed stage of the stalled attempt');
    t.notSame(context.lastObserved, {state: 'site_observed_nothing'});
    t.equal(context.scope.nodeId, 'node-hb-spent-a');

    t.equal(attempt.timedOut, true, 'attempt marked timed out (unchanged)');
    t.equal(service.heartbeatConsecutiveFailures, 1,
      'timeout still counts as a heartbeat failure (unchanged)');
    t.equal(service.heartbeatInFlight, false,
      'timeout still releases attempt ownership (unchanged)');
    t.equal(
      service.getHeartbeatPublicationDiagnostics().lastFailureStage,
      'attempt_timeout',
      'failure stage unchanged',
    );
  } finally {
    resetEnv();
  }
  t.end();
});

test('heartbeat attempt completed before its bound logs no spent wait', (t) => {
  initEnv();
  const timers = createManualTimers();
  const clock = {nowMs: 1000};
  const {service, capture} = createService('node-hb-spent-b', timers, clock);
  try {
    const attempt = service.beginHeartbeatAttempt();
    service.completeHeartbeatAttempt(attempt);
    t.equal(timers.handles[0].cleared, true, 'watchdog cleared on completion');
    t.equal(capture.spent().length, 0, 'no wait_bound_spent on completion');
    t.equal(service.heartbeatConsecutiveFailures, 0);
  } finally {
    resetEnv();
  }
  t.end();
});

test('node-state reporter timeout logs one wait_bound_spent ERROR and still ' +
  'rejects with the typed reporter timeout', async (t) => {
  initEnv();
  const timers = createManualTimers();
  const clock = {nowMs: 5000};
  const {service, capture} = createService('node-hb-spent-c', timers, clock, {
    nodeStateReporter: () => new Promise(() => {}),
  });
  try {
    const pending = service.callNodeStateReporterWithTimeout(
      {state: 'ready', publicationMode: 'heartbeat_steady'},
      30,
    );
    t.equal(timers.handles.length, 1, 'one reporter watchdog armed');
    clock.nowMs = 5030;
    timers.handles[0].callback();
    await t.rejects(pending, {code: 'node_state_reporter_timeout'},
      'expiry still rejects with the typed timeout (unchanged)');

    const spent = capture.spent();
    t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
    const context = spent[0].context;
    t.equal(context.wait, 'nodeStateReporterTimeoutMs');
    t.equal(context.boundMs, 30);
    t.equal(context.elapsedMs, 30);
    t.equal(context.lastObserved.reporterSettled, false);
    t.equal(context.lastObserved.requestedState, 'ready');
    t.equal(context.lastObserved.publicationMode, 'heartbeat_steady');
  } finally {
    resetEnv();
  }
});

test('node-state reporter acknowledged within its bound logs no spent wait',
  async (t) => {
    initEnv();
    const timers = createManualTimers();
    const clock = {nowMs: 5000};
    const {service, capture} = createService('node-hb-spent-d', timers, clock, {
      nodeStateReporter: async () => ({acknowledged: true}),
    });
    try {
      const result = await service.callNodeStateReporterWithTimeout(
        {state: 'ready'},
        30,
      );
      t.same(result, {acknowledged: true});
      t.equal(timers.handles[0].cleared, true, 'watchdog cleared');
      t.equal(capture.spent().length, 0, 'no wait_bound_spent on completion');
    } finally {
      resetEnv();
    }
  });
