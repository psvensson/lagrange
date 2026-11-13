// The real CDC lifecycle owner owns both a timer handle and its shutdown hold.
// Clock faults are injected at the existing TimeSource boundary. Reentry and
// clock replacement are admitted-seam controls, not claims that the ordinary
// platform clock spontaneously calls shutdown while acquiring a timer.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {RealTimeSource, VirtualTimeSource} from '../../src/time/time-source.js';

const DELAY_MS = 500;
const NODE_ID = 'cdc-delay-resource-owner';

function serviceOnClock(t) {
  const clock = new VirtualTimeSource();
  const service = new CDCIntegrationService({nodeId: NODE_ID, timeSource: clock});
  const schedule = clock.setTimeout.bind(clock);
  const cancel = clock.clearTimeout.bind(clock);
  t.after(() => {
    clock.setTimeout = schedule;
    clock.clearTimeout = cancel;
    service.timeSource = clock;
    service.markShuttingDown();
    // A failed cancellation still owns its original timer. Teardown drains
    // that actual clock after restoring the injected fault, even on a red.
    clock.advance(DELAY_MS);
  });
  return {service, clock, schedule, cancel};
}

for (const completion of ['clock', 'shutdown']) {
  test(`the real delay releases its exact timer and hold on ${completion}`, async (t) => {
    const {service, clock, cancel} = serviceOnClock(t);
    const cancelled = [];
    clock.clearTimeout = (handle) => {
      cancelled.push(handle);
      cancel(handle);
    };
    let completed = false;
    const pending = service.delayUntilShutdown(DELAY_MS).then(() => {
      completed = true;
    });
    assert.equal(service.shutdownReleases.size, 1);
    assert.equal(clock.pendingTimerCount(), 1);
    clock.advance(DELAY_MS - 1);
    await Promise.resolve();
    assert.equal(completed, false, 'the requested deadline is not shortened');
    if (completion === 'clock') clock.advance(1);
    else service.markShuttingDown();
    await pending;
    assert.equal(completed, true);
    assert.equal(service.shutdownReleases.size, 0);
    assert.equal(clock.pendingTimerCount(), 0);
    assert.equal(cancelled.length, completion === 'clock' ? 0 : 1);
    if (completion === 'shutdown') assert.notEqual(cancelled[0], null);
    service.markShuttingDown();
    assert.equal(cancelled.length, completion === 'clock' ? 0 : 1,
      'repeated shutdown does not cancel a released handle again');
  });
}

test('the default native clock still fires a delay and cancels the returned shutdown handle',
  async (t) => {
    const service = new CDCIntegrationService({nodeId: NODE_ID});
    t.after(() => service.markShuttingDown());
    const clock = service.timeSource;
    assert.ok(clock instanceof RealTimeSource);
    const schedule = clock.setTimeout.bind(clock);
    const cancel = clock.clearTimeout.bind(clock);
    const handles = [];
    const cancelled = [];
    clock.setTimeout = (callback, delayMs) => {
      const handle = schedule(callback, delayMs);
      handles.push(handle);
      return handle;
    };
    clock.clearTimeout = (handle) => {
      cancelled.push(handle);
      cancel(handle);
    };
    const fired = service.delayUntilShutdown(0);
    assert.equal(service.shutdownReleases.size, 1);
    assert.equal(handles[0].hasRef(), true, 'an awaited native delay stays referenced');
    await fired;
    assert.equal(service.shutdownReleases.size, 0);
    const stopped = service.delayUntilShutdown(DELAY_MS);
    service.markShuttingDown();
    await stopped;
    assert.equal(cancelled.length, 1);
    assert.equal(cancelled[0], handles[1]);
    assert.equal(service.shutdownReleases.size, 0);
  });

test('failed acquisition releases its hold and the same live owner can schedule again', async (t) => {
  const {service, clock, schedule} = serviceOnClock(t);
  const cause = new Error('delay timer acquisition failed');
  clock.setTimeout = () => {
    throw cause;
  };
  await assert.rejects(service.delayUntilShutdown(DELAY_MS), (error) => error === cause);
  assert.equal(service.shutdownReleases.size, 0, 'a rejected acquisition retains no shutdown hold');
  assert.equal(clock.pendingTimerCount(), 0, 'the injected fault occurred before allocation');
  assert.equal(service.isShuttingDown, false);
  clock.setTimeout = schedule;
  const useful = service.delayUntilShutdown(DELAY_MS);
  assert.equal(service.shutdownReleases.size, 1);
  assert.equal(clock.pendingTimerCount(), 1);
  clock.advance(DELAY_MS);
  await useful;
  assert.equal(service.shutdownReleases.size, 0);
  assert.equal(clock.pendingTimerCount(), 0);
});

test('an already terminal delay acquires no timer and never cancels a null handle', async (t) => {
  const {service, clock, schedule, cancel} = serviceOnClock(t);
  let acquisitions = 0;
  const cancelled = [];
  clock.setTimeout = (...args) => {
    acquisitions += 1;
    return schedule(...args);
  };
  clock.clearTimeout = (handle) => {
    cancelled.push(handle);
    cancel(handle);
  };
  service.markShuttingDown();
  await service.delayUntilShutdown(DELAY_MS);
  assert.equal(acquisitions, 0);
  assert.deepEqual(cancelled, [], 'absence of a timer is not a successful cancellation');
  assert.equal(service.shutdownReleases.size, 0);
  assert.equal(clock.pendingTimerCount(), 0);
});

test('failed cancellation rejects its delay but releases the next delay and retains the real timer',
  async (t) => {
    const {service, clock, cancel} = serviceOnClock(t);
    const cause = new Error('delay timer cancellation failed');
    let cancellations = 0;
    clock.clearTimeout = (handle) => {
      cancellations += 1;
      if (cancellations === 1) throw cause;
      cancel(handle);
    };
    const first = service.delayUntilShutdown(DELAY_MS).then(
      () => ({state: 'released'}), (error) => ({state: 'failed', cause: error}));
    const second = service.delayUntilShutdown(DELAY_MS).then(
      () => ({state: 'released'}), (error) => ({state: 'failed', cause: error}));
    assert.equal(clock.pendingTimerCount(), 2);
    assert.doesNotThrow(() => service.markShuttingDown());
    const failed = await first;
    assert.equal(failed.state, 'failed');
    assert.equal(failed.cause, cause);
    assert.deepEqual(await second, {state: 'released'});
    assert.equal(cancellations, 2);
    assert.equal(service.shutdownReleases.size, 0);
    assert.equal(clock.pendingTimerCount(), 1,
      'promise rejection does not claim the broken cancellation released its timer');
    clock.clearTimeout = cancel;
    clock.advance(DELAY_MS);
    await Promise.resolve();
    assert.equal(clock.pendingTimerCount(), 0, 'the original clock eventually fires its timer');
    assert.equal(await first, failed);
  });

for (const cancellationFails of [false, true]) {
  test(`admitted clock seam shuts down during acquisition; cancellation fails=${cancellationFails}`,
    async (t) => {
      const {service, clock, schedule, cancel} = serviceOnClock(t);
      const cause = new Error('reentrant delay cancellation failed');
      const cancelled = [];
      let acquired;
      clock.clearTimeout = (handle) => {
        cancelled.push(handle);
        if (cancellationFails && handle !== null) throw cause;
        cancel(handle);
      };
      clock.setTimeout = (callback, delayMs) => {
        acquired = schedule(callback, delayMs);
        service.markShuttingDown();
        return acquired;
      };
      const pending = service.delayUntilShutdown(DELAY_MS).then(
        () => ({state: 'released'}), (error) => ({state: 'failed', cause: error}));
      const outcome = await pending;
      assert.deepEqual(cancelled, [acquired], 'shutdown cancels the actual returned handle once');
      assert.deepEqual(outcome, cancellationFails ? {state: 'failed', cause} : {state: 'released'});
      if (cancellationFails) assert.equal(outcome.cause, cause);
      assert.equal(service.shutdownReleases.size, 0);
      assert.equal(clock.pendingTimerCount(), cancellationFails ? 1 : 0);
      clock.clearTimeout = cancel;
      clock.advance(DELAY_MS);
      await Promise.resolve();
      assert.equal(clock.pendingTimerCount(), 0);
      assert.deepEqual(await pending, outcome);
    });
}

test('admitted acquisition reentry followed by a throw preserves that acquisition failure',
  async (t) => {
    const {service, clock} = serviceOnClock(t);
    const cause = new Error('reentrant timer acquisition failed');
    clock.setTimeout = () => {
      service.markShuttingDown();
      throw cause;
    };
    await assert.rejects(service.delayUntilShutdown(DELAY_MS), (error) => error === cause);
    assert.equal(service.shutdownReleases.size, 0);
    assert.equal(clock.pendingTimerCount(), 0);
  });

for (const replacement of ['during-acquisition', 'after-acquisition']) {
  test(`admitted clock replacement ${replacement} keeps cancellation with the original clock`,
    async (t) => {
      const {service, clock, schedule} = serviceOnClock(t);
      const otherClock = new VirtualTimeSource();
      t.after(() => otherClock.advance(DELAY_MS));
      let otherFired = false;
      otherClock.setTimeout(() => {
        otherFired = true;
      }, DELAY_MS);
      if (replacement === 'during-acquisition') {
        clock.setTimeout = (callback, delayMs) => {
          const handle = schedule(callback, delayMs);
          service.timeSource = otherClock;
          service.markShuttingDown();
          return handle;
        };
      }
      const pending = service.delayUntilShutdown(DELAY_MS);
      if (replacement === 'after-acquisition') {
        service.timeSource = otherClock;
        service.markShuttingDown();
      }
      await pending;
      assert.equal(clock.pendingTimerCount(), 0, 'the acquiring clock releases its own timer');
      assert.equal(otherClock.pendingTimerCount(), 1,
        'an equal numeric handle on another clock is a different resource');
      assert.equal(service.shutdownReleases.size, 0);
      otherClock.advance(DELAY_MS);
      assert.equal(otherFired, true, 'the other clock retains its useful independent work');
    });
}
