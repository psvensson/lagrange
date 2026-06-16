import t from 'tap';
import {VirtualTick} from '../../src/raft/virtual-tick.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

// DT4 Raft election seam: VirtualTick mirrors the tick-tock surface liferaft uses
// (setTimeout/setInterval/setImmediate/active/clear/adjust/end) but schedules on a
// TimeSource, so election timing is deterministically advanceable. These tests pin
// the tick-tock-equivalent semantics and the OPT-IN swap in the LifeRaft wrapper.

function makeTick() {
  const ts = new VirtualTimeSource();
  const ctx = {label: 'raft-ctx'};
  return {ts, ctx, tick: new VirtualTick(ctx, ts)};
}

t.test('setTimeout fires once on advance, then is no longer active', async (t) => {
  const {ts, tick} = makeTick();
  let fired = 0;
  tick.setTimeout('election', () => {
    fired += 1;
  }, 100);
  t.ok(tick.active('election'), 'active before firing');
  ts.advance(99);
  t.equal(fired, 0, 'does not fire early');
  ts.advance(1);
  t.equal(fired, 1, 'fires at its due time');
  t.notOk(tick.active('election'), 'one-shot cleared from memory after firing');
  ts.advance(1000);
  t.equal(fired, 1, 'does not fire again');
});

t.test('setTimeout coalesces callbacks under one name', async (t) => {
  const {ts, tick} = makeTick();
  const order = [];
  tick.setTimeout('t', () => order.push('a'), 50);
  tick.setTimeout('t', () => order.push('b'), 999); // same name -> appended, time ignored
  ts.advance(50);
  t.same(order, ['a', 'b'], 'both callbacks fire at the first timer time');
});

t.test('callbacks are invoked with the context', async (t) => {
  const {ts, ctx, tick} = makeTick();
  let seenThis = null;
  tick.setTimeout('t', function cb() {
    seenThis = this;
  }, 10);
  ts.advance(10);
  t.equal(seenThis, ctx, 'fn.call(context) like tick-tock');
});

t.test('setInterval re-fires and stays active until cleared', async (t) => {
  const {ts, tick} = makeTick();
  let ticks = 0;
  tick.setInterval('beat', () => {
    ticks += 1;
  }, 10);
  ts.advance(35);
  t.equal(ticks, 3, 'fired at 10/20/30');
  t.ok(tick.active('beat'), 'interval stays active');
  tick.clear('beat');
  ts.advance(100);
  t.equal(ticks, 3, 'cleared interval stops');
  t.notOk(tick.active('beat'), 'no longer active');
});

t.test('setImmediate fires at virtual time 0', async (t) => {
  const {ts, tick} = makeTick();
  let fired = false;
  tick.setImmediate('now', () => {
    fired = true;
  });
  ts.advance(0);
  t.ok(fired, 'immediate fires on advance(0)');
});

t.test('clear accepts a comma/space separated string (liferaft usage)',
  async (t) => {
    const {ts, tick} = makeTick();
    let h = 0;
    let e = 0;
    tick.setTimeout('heartbeat', () => {
      h += 1;
    }, 50);
    tick.setTimeout('election', () => {
      e += 1;
    }, 50);
    tick.clear('heartbeat, election'); // exact form liferaft calls
    ts.advance(100);
    t.equal(h + e, 0, 'both named timers cleared from one string');
  });

t.test('clear with no args clears every timer', async (t) => {
  const {ts, tick} = makeTick();
  let fired = 0;
  tick.setTimeout('a', () => {
    fired += 1;
  }, 10);
  tick.setTimeout('b', () => {
    fired += 1;
  }, 10);
  tick.clear();
  ts.advance(50);
  t.equal(fired, 0, 'all cleared');
});

t.test('adjust re-arms a timeout to a new duration', async (t) => {
  const {ts, tick} = makeTick();
  let fired = false;
  tick.setTimeout('election', () => {
    fired = true;
  }, 100);
  ts.advance(50);
  tick.adjust('election', 100); // restart the 100ms window from now (t=50)
  ts.advance(99);
  t.notOk(fired, 'old 100ms deadline (t=100) was cancelled by adjust');
  ts.advance(1);
  t.ok(fired, 'fires at the adjusted deadline (t=150)');
});

t.test('end clears everything and is idempotent', async (t) => {
  const {ts, tick} = makeTick();
  let fired = false;
  tick.setTimeout('a', () => {
    fired = true;
  }, 10);
  t.equal(tick.end(), true, 'first end returns true');
  t.equal(tick.end(), false, 'second end returns false (context gone)');
  ts.advance(50);
  t.notOk(fired, 'no timer fires after end');
});

t.test('duration strings parse like tick-tock (millisecond)', async (t) => {
  const {ts, tick} = makeTick();
  let fired = false;
  tick.setTimeout('beat', () => {
    fired = true;
  }, '50 ms');
  ts.advance(49);
  t.notOk(fired, 'the 50 ms string parsed to 50');
  ts.advance(1);
  t.ok(fired, 'fired at 50');
});

t.test('LifeRaft swaps in a VirtualTick only when a timeSource is given',
  async (t) => {
    const virtual = new VirtualTimeSource();
    // High election window so the auto-armed heartbeat timer (re-armed onto the
    // virtual clock at construction) does not fire within this test's advances.
    const withTs = new LifeRaft('addr-a', {
      'timeSource': virtual,
      'election min': '10000 ms',
      'election max': '10000 ms',
    });
    t.teardown(() => withTs.end());
    t.type(withTs.timers, VirtualTick,
      'a timeSource opts into the VirtualTick election seam');

    // The election-timer path is now virtual: arming via the same API liferaft
    // uses fires deterministically on advance.
    let elected = false;
    withTs.timers.setTimeout('election', () => {
      elected = true;
    }, 200);
    virtual.advance(200);
    t.ok(elected, 'election timer fires by advancing the virtual clock');

    const withoutTs = new LifeRaft('addr-b', {});
    t.teardown(() => withoutTs.end());
    t.notOk(withoutTs.timers instanceof VirtualTick,
      'no timeSource -> the real tick-tock Tick (production unchanged)');
  });
