// Component witnesses for the real foreground retry owner and its consumer.
// Durable cases use the actual source ledger/subscriber/topology fixture with
// controlled recipient answers; they do not claim native recipient commit proof.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';

import {COLUMN, TABLES} from '../../src/constants/index.js';
import {WAIT_BOUND_SPENT_EVENT} from '../../src/logging/wait-bound-spent.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {CDC_GROUP_FOREGROUND_CONTINUATION as CONTINUATION,
  CDC_GROUP_FOREGROUND_RETRY_STATE as RETRY,
  CDC_GROUP_PROPAGATION_DELIVERY_ERROR as DELIVERY_ERROR,
  CDC_GROUP_PROPAGATION_STATE as STATE} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {CDCGroupPropagationService} from
  '../../src/topology/cdc-group-propagation-service.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {RESPONSE, assertDebtWithoutAck, topologyProgressFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';
import {settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {createGroupRow, createMessageGroupServiceRow, createMessageRouter,
  createTopologyCache, setupConfig, teardownConfig} from
  './cdc-group-propagation-service-harness.js';

const RETRY_DELAY_MS = 50;
const TEST_TIMEOUT_MS = 2000;
const FOREGROUND_WAIT = 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS';
const DURATION_WAIT = 'CDC delivery invocation remaining duration for the next retry';
const TARGET = Object.freeze({groupId: 'mg-node-b', coordinatorNodeId: 'node-b',
  address: 'node-b/message-group/mg-node-b'});

beforeEach(() => setupConfig(LATENCY_PROPAGATION_MODE.SAFE));
afterEach(teardownConfig);

function recordLogs(service) {
  const entries = [];
  const record = (level, message, context) => entries.push({level, message, context});
  service.logger = {
    info: (message, context) => record('info', message, context),
    debug: (message, context) => record('debug', message, context),
    warn: (message, context) => record('warn', message, context),
    error: (message, context) => record('error', message, context),
    logConsoleOnly: record,
  };
  return entries;
}

function spentReports(entries) {
  return entries.filter((entry) => entry.context?.event === WAIT_BOUND_SPENT_EVENT);
}

function ordinaryFixture(t, maxAttempts) {
  const router = createMessageRouter([{acknowledged: false, error: 'controlled refusal'}]);
  const service = new CDCGroupPropagationService({nodeId: 'node-a',
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: 'g-1'}],
      groups: [createGroupRow('g-1', 'node-a'), createGroupRow('g-2', 'node-b')],
      services: [createMessageGroupServiceRow(TARGET.groupId, TARGET.coordinatorNodeId,
        TARGET.address, RAFT_ROLE.LEADER)],
    }),
    messageRouter: router,
    latencyTreeService: {getRoutingOrder: () => ['g-1', 'g-2']},
    deliveryRetryMaxAttempts: maxAttempts,
    deliveryRetryDelayMs: RETRY_DELAY_MS,
    deliveryRetryMaxDelayMs: RETRY_DELAY_MS,
  });
  const logs = recordLogs(service);
  service.initialize();
  service.start();
  t.after(() => service.stop());
  return {service, logs, router, deliver: () => service.deliverToTargetsWithRetry({
    tableName: TABLES.STORAGE_RESERVATIONS, operation: 'UPDATE',
    data: {reservation_id: 'foreground-reservation', status: 'released'},
    sourceGroupId: 'mg-node-a', targets: [{...TARGET}], allowBatching: false,
  })};
}

// The barrier holds only the already-computed result. The production helper
// still decides, schedules, sleeps and observes stop through its real owners.
function observeRetryDecisions(t, service, barrier = false) {
  const decisions = [];
  const reached = Promise.withResolvers();
  const released = Promise.withResolvers();
  const actual = service.waitForForegroundRetry.bind(service);
  service.waitForForegroundRetry = async (...args) => {
    const decision = await actual(...args);
    decisions.push(decision);
    reached.resolve(decision);
    if (barrier) await released.promise;
    return decision;
  };
  t.after(() => released.resolve());
  return {decisions, reached: reached.promise, release: released.resolve};
}

function assertNoTransientPayloads(service) {
  assert.equal(service.immediateBatchEntriesByKey.size, 0);
  assert.equal(service.immediateBatchTimers.size, 0);
  assert.equal(service.backgroundRetryEntriesByKey.size, 0);
  assert.equal(service.backgroundRetryTimers.size, 0);
  assert.equal(service.retrySleepReleases.size, 0);
}

function assertStopped(answer, f, observed) {
  assert.deepEqual(answer.map((failure) => failure.targetGroupId), [TARGET.groupId]);
  assert.ok(answer.every((failure) => failure.error === DELIVERY_ERROR.PROPAGATION_STOPPED));
  assert.equal(observed.decisions.length, 1,
    'the consumer performs no extra foreground iteration after the real helper decision');
  assert.equal(f.router.calls.length, 1, 'no further recipient effect follows stop');
  assert.equal(spentReports(f.logs).length, 0, 'stop does not spend a retry budget');
  assertNoTransientPayloads(f.service);
}

test('foreground consumer rechecks stop after actual ATTEMPTS_EXHAUSTED',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const f = ordinaryFixture(t, 1);
    const observed = observeRetryDecisions(t, f.service, true);
    const delivery = f.deliver();
    assert.equal((await observed.reached).state, RETRY.ATTEMPTS_EXHAUSTED);
    f.service.stop();
    observed.release();
    assertStopped(await delivery, f, observed);
  });

test('foreground consumer rechecks stop after actual sleep returns ADVANCE',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const f = ordinaryFixture(t, 2);
    const observed = observeRetryDecisions(t, f.service, true);
    const delivery = f.deliver();
    await settleTicks();
    assert.equal(f.service.retrySleepReleases.size, 1, 'the actual sleep is armed');
    t.mock.timers.tick(RETRY_DELAY_MS);
    assert.equal((await observed.reached).state, RETRY.ADVANCE);
    f.service.stop();
    observed.release();
    assertStopped(await delivery, f, observed);
  });

test('foreground consumer preserves observed STOPPED when service restarts before consumption',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const f = ordinaryFixture(t, 2);
    const observed = observeRetryDecisions(t, f.service, true);
    const delivery = f.deliver();
    await settleTicks();
    assert.equal(f.service.retrySleepReleases.size, 1);
    f.service.stop();
    assert.equal((await observed.reached).state, RETRY.STOPPED);
    f.service.start();
    assert.equal(f.service.state, STATE.RUNNING);
    observed.release();
    assertStopped(await delivery, f, observed);
  });

test('ordinary foreground attempt exhaustion truthfully hands work to background retry',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    t.mock.timers.enable({apis: ['setTimeout']});
    const f = ordinaryFixture(t, 1);
    const observed = observeRetryDecisions(t, f.service);
    const answer = await f.deliver();
    assert.equal(answer.length, 1);
    assert.deepEqual(observed.decisions.map(({state}) => state), [RETRY.ATTEMPTS_EXHAUSTED]);
    assert.equal(f.service.backgroundRetryEntriesByKey.size, 1);
    assert.equal(f.service.backgroundRetryTimers.size, 1);
    const reports = spentReports(f.logs);
    assert.equal(reports.length, 1);
    const report = reports[0].context;
    assert.equal(report.wait, FOREGROUND_WAIT);
    assert.equal(report.lastObserved.stopReason, RETRY.ATTEMPTS_EXHAUSTED);
    assert.equal(report.lastObserved.continuation, CONTINUATION.BACKGROUND_RETRY);
    assert.equal(report.lastObserved.failureCountUnit, 'target_failures');
    assert.equal(report.lastObserved.background, false);
    assert.match(report.awaited, /hand over to background retry/);
    assert.equal(report.lastObserved.attempt, 1);
    assert.equal(report.lastObserved.maxAttempts, 1);
  });

async function durableFixture(t, maxAttempts) {
  const f = await topologyProgressFixture(t);
  f.topology.deliveryRetryMaxAttempts = maxAttempts;
  f.topology.deliveryRetryDelayMs = RETRY_DELAY_MS;
  f.topology.deliveryRetryMaxDelayMs = RETRY_DELAY_MS;
  f.targetMode = RESPONSE.UNKNOWN;
  f.logs = recordLogs(f.topology);
  f.observed = observeRetryDecisions(t, f.topology);
  return f;
}

function assertDurableDebt(f) {
  assertDebtWithoutAck(f);
  assertNoTransientPayloads(f.topology);
}

function assertDurableSpent(f, state, wait) {
  const reports = spentReports(f.logs);
  assert.equal(reports.length, 1);
  const report = reports[0].context;
  assert.equal(report.wait, wait);
  assert.equal(report.lastObserved.stopReason, state);
  assert.equal(report.lastObserved.continuation, CONTINUATION.SOURCE_OWNER);
  assert.equal(report.lastObserved.failureCountUnit, 'aggregate_durable_wave');
  assert.equal(report.lastObserved.failureCount, 1);
  assert.equal(report.lastObserved.background, false);
  assert.match(report.awaited, /unresolved debt returns to the source owner/);
  assert.doesNotMatch(report.awaited, /hand over to background retry/);
  return report;
}

test('durable foreground attempt exhaustion retains source debt and source continuation',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const f = await durableFixture(t, 1);
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.targetCalls.length, 1, 'the recipient path was engaged');
    assert.deepEqual(f.observed.decisions.map(({state}) => state), [RETRY.ATTEMPTS_EXHAUSTED]);
    const report = assertDurableSpent(f, RETRY.ATTEMPTS_EXHAUSTED, FOREGROUND_WAIT);
    assert.equal(report.lastObserved.attempt, 1);
    assert.equal(report.lastObserved.maxAttempts, 1);
    assertDurableDebt(f);
  });

function leaveRemainingDuration(f, remainingMs) {
  f.duringTarget = () => {
    f.duringTarget = null;
    const context = f.leader.cdcDelivery.activeCdcInvocation.context;
    const advanceMs = context.remainingMs() - remainingMs;
    assert.ok(advanceMs > 0, 'fixture reduces the actual source grant, never renews it');
    f.clock.advance(advanceMs);
    assert.equal(context.remainingMs(), remainingMs);
  };
}

for (const remainingMs of [RETRY_DELAY_MS - 1, RETRY_DELAY_MS]) {
  test(`durable foreground refuses a retry with ${remainingMs} ms remaining for a 50 ms delay`,
    {timeout: TEST_TIMEOUT_MS}, async (t) => {
      const f = await durableFixture(t, 3);
      leaveRemainingDuration(f, remainingMs);
      assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
      assert.equal(f.targetCalls.length, 1);
      assert.deepEqual(f.observed.decisions.map(({state}) => state),
        [RETRY.INSUFFICIENT_DURATION]);
      const report = assertDurableSpent(f, RETRY.INSUFFICIENT_DURATION, DURATION_WAIT);
      assert.equal(report.lastObserved.remainingMs, remainingMs);
      assert.equal(report.lastObserved.retryDelayMs, RETRY_DELAY_MS);
      assert.equal(report.lastObserved.attempt, 1);
      assert.equal(report.lastObserved.maxAttempts, 3, 'attempt budget remains unspent');
      assertDurableDebt(f);
    });
}

test('durable foreground sufficient duration admits the actual delay and provisional scan release',
  {timeout: TEST_TIMEOUT_MS}, async (t) => {
    const f = await durableFixture(t, 3);
    t.mock.timers.enable({apis: ['setTimeout']});
    leaveRemainingDuration(f, RETRY_DELAY_MS + 1);
    const drive = f.drive();
    await settleTicks();
    assert.equal(f.topology.retrySleepReleases.size, 1, 'the real sleep is held');
    const targetCallsBeforeRetry = f.targetCalls.length;
    assert.ok(targetCallsBeforeRetry > 0, 'the controlled recipient was reached');
    t.mock.timers.tick(RETRY_DELAY_MS - 1);
    f.clock.advance(RETRY_DELAY_MS - 1);
    await settleTicks();
    assert.equal(f.targetCalls.length, targetCallsBeforeRetry, 'no retry before its exact delay');
    assert.equal(f.observed.decisions.length, 0, 'the real helper has not returned yet');
    f.targetMode = RESPONSE.WEAK;
    t.mock.timers.tick(1);
    f.clock.advance(1);
    assert.equal((await drive).state, DRIVE.PROVISIONAL);
    assert.equal(f.targetCalls.length, targetCallsBeforeRetry + 1,
      'the fresh provisional answer covers the remaining recipient');
    assert.deepEqual(f.observed.decisions.map(({state}) => state), [RETRY.ADVANCE]);
    assert.equal(spentReports(f.logs).length, 0, 'successful coverage does not report exhaustion');
    assertDurableDebt(f);
  });
