// Component witnesses for the real foreground retry owner and its consumer,
// on the actual source ledger/subscriber/topology fixture with controlled
// recipient answers; they do not claim native recipient commit proof.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';

import {WAIT_BOUND_SPENT_EVENT} from '../../src/logging/wait-bound-spent.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {CDC_GROUP_FOREGROUND_RETRY_STATE as RETRY,
  CDC_GROUP_PROPAGATION_STATE as STATE} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {RESPONSE, assertDebtWithoutAck, topologyProgressFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';
import {settleTicks} from '../test-helpers/participant-transaction-fixture.js';
import {setupConfig, teardownConfig} from './cdc-group-propagation-service-harness.js';
import {scaleByMachineFactor} from '../../scripts/test-machine-factor.js';

const RETRY_DELAY_MS = 50;
// A hang guard over the real source fixture (its first leader start warms the
// runtime), scaled for the host like every work-bound budget.
const TEST_TIMEOUT_MS = 3000;
const FOREGROUND_WAIT = 'CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS';
const DURATION_WAIT = 'CDC delivery invocation remaining duration for the next retry';

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

function assertNoHeldWork(topology) {
  assert.equal(topology.retrySleepReleases.size, 0, 'no retry delay is held');
  assert.equal(topology.activeDurablePropagation, null, 'no durable wave is in flight');
}

function assertDurableDebt(f) {
  assertDebtWithoutAck(f);
  assertNoHeldWork(f.topology);
}

function assertDurableSpent(f, state, wait) {
  const reports = spentReports(f.logs);
  assert.equal(reports.length, 1);
  const report = reports[0].context;
  assert.equal(report.wait, wait);
  assert.equal(report.lastObserved.stopReason, state);
  assert.equal(report.lastObserved.failureCount, 1, 'one aggregate durable wave');
  assert.match(report.awaited, /unresolved debt returns to the source owner/);
  assert.doesNotMatch(report.awaited, /hand over to background retry/);
  return report;
}

// After stop the consumer performs no further iteration and no recipient
// effect; the source owner keeps the debt and nothing spends a budget.
async function assertStoppedDrive(f, drive) {
  await drive;
  assert.equal(f.observed.decisions.length, 1,
    'the consumer performs no extra foreground iteration after the real helper decision');
  assert.equal(f.targetCalls.length, 1, 'no further recipient effect follows stop');
  assert.equal(spentReports(f.logs).length, 0, 'stop does not spend a retry budget');
  await settleTicks();
  assertDurableDebt(f);
}

async function barrierFixture(t, maxAttempts) {
  const f = await durableFixture(t, maxAttempts);
  f.observed = observeRetryDecisions(t, f.topology, true);
  return f;
}

test('foreground consumer rechecks stop after actual ATTEMPTS_EXHAUSTED',
  {timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}, async (t) => {
    const f = await barrierFixture(t, 1);
    const drive = f.drive();
    assert.equal((await f.observed.reached).state, RETRY.ATTEMPTS_EXHAUSTED);
    f.topology.stop();
    f.observed.release();
    await assertStoppedDrive(f, drive);
  });

test('foreground consumer rechecks stop after actual sleep returns ADVANCE',
  {timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}, async (t) => {
    const f = await barrierFixture(t, 2);
    t.mock.timers.enable({apis: ['setTimeout']});
    const drive = f.drive();
    await settleTicks();
    assert.equal(f.topology.retrySleepReleases.size, 1, 'the actual sleep is armed');
    t.mock.timers.tick(RETRY_DELAY_MS);
    f.clock.advance(RETRY_DELAY_MS);
    assert.equal((await f.observed.reached).state, RETRY.ADVANCE);
    f.topology.stop();
    f.observed.release();
    await assertStoppedDrive(f, drive);
  });

// stop() retires the wave's invocation, so the held sleep ends by refusal:
// no decision is consumed, and a restart before the drive settles resumes
// nothing (was: an observed STOPPED survives a restart).
test('stop during the held retry delay ends the wave at once; a restart resumes nothing',
  {timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}, async (t) => {
    const f = await durableFixture(t, 2);
    t.mock.timers.enable({apis: ['setTimeout']});
    const drive = f.drive();
    await settleTicks();
    assert.equal(f.topology.retrySleepReleases.size, 1);
    f.topology.stop();
    f.topology.start();
    assert.equal(f.topology.state, STATE.RUNNING);
    await drive;
    assert.deepEqual(f.observed.decisions, [], 'the retired wave consumes no decision');
    assert.equal(f.targetCalls.length, 1, 'no further recipient effect follows stop');
    assert.equal(spentReports(f.logs).length, 0, 'stop does not spend a retry budget');
    await settleTicks();
    assertDurableDebt(f);
  });

// Deleted: 'ordinary foreground attempt exhaustion truthfully hands work to
// background retry' - the background retry is gone with the volatile branch.

test('durable foreground attempt exhaustion retains source debt and source continuation',
  {timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}, async (t) => {
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
    {timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}, async (t) => {
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
  {timeout: scaleByMachineFactor(TEST_TIMEOUT_MS)}, async (t) => {
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

