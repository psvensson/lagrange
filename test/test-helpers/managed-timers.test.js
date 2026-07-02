import {test} from '../../src/test-helpers/tap.js';
import {
  managedInterval,
  managedSleep,
  managedTimeout,
} from '../../src/test-helpers/managed-timers.js';

// Simulates the tap teardown contract closely enough to prove clearance:
// collect teardown callbacks, run them in reverse registration order.
function fakeTest() {
  const teardowns = [];
  return {
    teardown: (fn) => teardowns.push(fn),
    runTeardowns: async () => {
      for (const fn of teardowns.reverse()) {
        await fn();
      }
    },
  };
}

test('managedTimeout fires normally within the test lifetime', (t) => {
  const fake = fakeTest();
  managedTimeout(fake, () => {
    t.pass('fired');
    t.end();
  }, 5);
});

test('managedTimeout is cleared by teardown — the re-armed-loop hang class', async (t) => {
  const fake = fakeTest();
  let fired = false;
  // The hang class: a "retry loop" that re-arms itself forever. Bound to the
  // fake test, teardown must break the chain.
  const reArm = () => {
    fired = true;
    managedTimeout(fake, reArm, 10);
  };
  managedTimeout(fake, reArm, 10);
  await new Promise((resolve) => setTimeout(resolve, 25));
  t.ok(fired, 'loop ran while the test was alive');
  await fake.runTeardowns();
  fired = false;
  await new Promise((resolve) => setTimeout(resolve, 30));
  t.equal(fired, false, 'no re-arm survives teardown');
});

test('managedInterval stops at teardown', async (t) => {
  const fake = fakeTest();
  let ticks = 0;
  managedInterval(fake, () => {
    ticks += 1;
  }, 5);
  await new Promise((resolve) => setTimeout(resolve, 20));
  await fake.runTeardowns();
  const after = ticks;
  await new Promise((resolve) => setTimeout(resolve, 20));
  t.ok(ticks > 0, 'interval ticked while alive');
  t.equal(ticks, after, 'interval dead after teardown');
});

test('managedSleep resolves normally and resolves early on teardown', async (t) => {
  const fake = fakeTest();
  const started = Date.now();
  await managedSleep(fake, 10);
  t.ok(Date.now() - started >= 9, 'normal sleep waited');

  const fake2 = fakeTest();
  const pending = managedSleep(fake2, 60_000);
  await fake2.runTeardowns();
  // Must resolve promptly instead of holding the process for a minute.
  await pending;
  t.pass('in-flight sleep released by teardown');
});
