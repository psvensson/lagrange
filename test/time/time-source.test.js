import t from 'tap';
import {
  RealTimeSource,
  VirtualTimeSource,
  resolveTimeSource,
} from '../../src/time/time-source.js';

// DT4 step 1: the TimeSource seam. RealTimeSource must be byte-for-byte the
// platform clock (so threading it changes nothing in production); VirtualTimeSource
// must be deterministic so the convergence harness can drive timing races.

t.test('RealTimeSource delegates to the platform clock + timers', async (t) => {
  const ts = new RealTimeSource();
  const before = Date.now();
  const now = ts.now();
  const after = Date.now();
  t.ok(now >= before && now <= after, 'now() returns the wall clock');

  await t.test('setTimeout fires and clearTimeout cancels', async (t) => {
    let fired = false;
    const handle = ts.setTimeout(() => {
      fired = true;
    }, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    t.ok(fired, 'real setTimeout fired');
    ts.clearTimeout(handle);

    let cancelledFired = false;
    const cancel = ts.setTimeout(() => {
      cancelledFired = true;
    }, 5);
    ts.clearTimeout(cancel);
    await new Promise((resolve) => setTimeout(resolve, 15));
    t.notOk(cancelledFired, 'real clearTimeout cancelled the pending timer');
  });

  await t.test('setInterval ticks and clearInterval stops it', async (t) => {
    let ticks = 0;
    const handle = ts.setInterval(() => {
      ticks += 1;
    }, 2);
    await new Promise((resolve) => setTimeout(resolve, 15));
    ts.clearInterval(handle);
    const ticksAtStop = ticks;
    t.ok(ticksAtStop >= 1, 'real setInterval ticked at least once');
    await new Promise((resolve) => setTimeout(resolve, 15));
    t.equal(ticks, ticksAtStop, 'real clearInterval stopped further ticks');
  });
});

t.test('VirtualTimeSource does not move until advanced', async (t) => {
  const ts = new VirtualTimeSource({startMs: 1000});
  t.equal(ts.now(), 1000, 'starts at startMs');
  let fired = false;
  ts.setTimeout(() => {
    fired = true;
  }, 50);
  t.notOk(fired, 'timer does not fire before advance');
  t.equal(ts.now(), 1000, 'now() unchanged before advance');
  ts.advance(49);
  t.notOk(fired, 'timer does not fire one ms early');
  t.equal(ts.now(), 1049, 'clock advanced to 1049');
  ts.advance(1);
  t.ok(fired, 'timer fires exactly at its due time');
  t.equal(ts.now(), 1050, 'clock at the due time');
});

t.test('VirtualTimeSource defaults startMs to 0 on bad input', async (t) => {
  t.equal(new VirtualTimeSource().now(), 0, 'no options -> 0');
  t.equal(new VirtualTimeSource({startMs: 'x'}).now(), 0, 'NaN startMs -> 0');
});

t.test('VirtualTimeSource fires due timers in (dueAt, scheduling) order',
  async (t) => {
    const ts = new VirtualTimeSource();
    const order = [];
    ts.setTimeout(() => order.push('b-10'), 10);
    ts.setTimeout(() => order.push('a-10'), 10); // same dueAt, scheduled later
    ts.setTimeout(() => order.push('c-5'), 5);
    ts.advance(20);
    t.same(order, ['c-5', 'b-10', 'a-10'],
      'earlier dueAt first; ties broken by scheduling order');
  });

t.test('VirtualTimeSource advances now() to each timer dueAt as it fires',
  async (t) => {
    const ts = new VirtualTimeSource();
    const seenNow = [];
    ts.setTimeout(() => seenNow.push(ts.now()), 5);
    ts.setTimeout(() => seenNow.push(ts.now()), 15);
    ts.advance(100);
    t.same(seenNow, [5, 15], 'callback sees the clock at its own due time');
    t.equal(ts.now(), 100, 'clock ends at the advance target');
  });

t.test('VirtualTimeSource honors timers scheduled inside a callback', async (t) => {
  const ts = new VirtualTimeSource();
  const order = [];
  ts.setTimeout(() => {
    order.push('first@10');
    ts.setTimeout(() => order.push('nested@25'), 15); // due at 10+15=25, in window
    ts.setTimeout(() => order.push('nested@200'), 190); // due at 200, out of window
  }, 10);
  ts.advance(100);
  t.same(order, ['first@10', 'nested@25'],
    'a timer armed by a callback fires if it comes due within the same window');
  t.equal(ts.pendingTimerCount(), 1, 'the out-of-window nested timer remains');
});

t.test('VirtualTimeSource setInterval reschedules deterministically', async (t) => {
  const ts = new VirtualTimeSource();
  let ticks = 0;
  const handle = ts.setInterval(() => {
    ticks += 1;
  }, 10);
  ts.advance(35);
  t.equal(ticks, 3, 'interval fired at 10, 20, 30 within a 35ms advance');
  ts.clearInterval(handle);
  ts.advance(100);
  t.equal(ticks, 3, 'clearInterval stops further ticks');
});

t.test('VirtualTimeSource clamps a zero-interval reschedule (no infinite loop)',
  async (t) => {
    const ts = new VirtualTimeSource();
    let ticks = 0;
    const handle = ts.setInterval(() => {
      ticks += 1;
    }, 0);
    ts.advance(3);
    // 0ms interval clamps reschedule to the 1ms minimum: fires at 0,1,2,3.
    t.equal(ticks, 4, 'zero-interval clamps to 1ms and terminates');
    ts.clearInterval(handle);
  });

t.test('VirtualTimeSource advance(0) fires only already-due timers', async (t) => {
  const ts = new VirtualTimeSource();
  const order = [];
  ts.setTimeout(() => order.push('zero'), 0);
  ts.setTimeout(() => order.push('later'), 5);
  ts.advance(0);
  t.same(order, ['zero'], 'a 0-delay timer is due immediately; a 5ms one is not');
});

t.test('VirtualTimeSource advance throws on an unbounded zero-delay re-arm',
  async (t) => {
    const ts = new VirtualTimeSource();
    const rearm = () => {
      ts.setTimeout(rearm, 0);
    };
    ts.setTimeout(rearm, 0);
    t.throws(() => ts.advance(1), /exceeded/,
      'a callback re-arming a 0-delay timer forever fails loud, not hangs');
  });

t.test('VirtualTimeSource _schedule rejects a non-function callback', async (t) => {
  const ts = new VirtualTimeSource();
  t.throws(() => ts.setTimeout(null, 10), /must be a function/);
});

t.test('resolveTimeSource returns the explicit timeSource or a RealTimeSource',
  async (t) => {
    const virtual = new VirtualTimeSource();
    t.equal(resolveTimeSource({timeSource: virtual}), virtual,
      'a valid timeSource is returned as-is');
    t.type(resolveTimeSource({}), RealTimeSource,
      'no timeSource -> RealTimeSource default');
    t.type(resolveTimeSource(), RealTimeSource, 'no options -> RealTimeSource');
    t.type(resolveTimeSource({timeSource: {}}), RealTimeSource,
      'an invalid timeSource (no now()) falls back to RealTimeSource');
  });
