import {test} from '../../../../src/test-helpers/tap.js';
import {installDeterminismTripwire} from '../determinism-tripwire.js';
import {RealTimeSource} from '../../../../src/time/time-source.js';

test('tripwire records a raw Date.now reached through a real src/ frame', (t) => {
  const tripwire = installDeterminismTripwire();
  try {
    // RealTimeSource.now() is a genuine src/ call site of raw Date.now
    // (src/time/time-source.js) — exactly the class the tripwire polices.
    new RealTimeSource().now();
    new RealTimeSource().now();
  } finally {
    tripwire.uninstall();
  }
  const violations = tripwire.violations();
  t.equal(violations.length, 1, 'dedup: one record per call site');
  t.equal(violations[0].api, 'Date.now');
  t.equal(violations[0].count, 2, 'hit count accumulates');
  t.match(violations[0].frame, /src\/time\/time-source\.js:\d+/);
  t.throws(() => tripwire.assertClean(), /determinism tripwire/);
  t.end();
});

test('tripwire ignores Date.now/Math.random from non-src callers', (t) => {
  const tripwire = installDeterminismTripwire();
  try {
    Date.now();
    Math.random();
  } finally {
    tripwire.uninstall();
  }
  t.same(tripwire.violations(), []);
  t.doesNotThrow(() => tripwire.assertClean());
  t.end();
});

test('fail mode throws on first src/-reached call and self-uninstalls', (t) => {
  const tripwire = installDeterminismTripwire({mode: 'fail'});
  let threw = null;
  try {
    new RealTimeSource().now();
  } catch (error) {
    threw = error;
  } finally {
    tripwire.uninstall();
  }
  t.match(threw?.message, /raw Date\.now reached from/);
  t.equal(Date.now === Date.now, true);
  // Globals restored: a plain call after uninstall must not record.
  const before = tripwire.violations().length;
  Date.now();
  t.equal(tripwire.violations().length, before);
  t.end();
});

test('uninstall restores the untouched globals', (t) => {
  const realNow = Date.now;
  const realRandom = Math.random;
  const tripwire = installDeterminismTripwire();
  tripwire.uninstall();
  t.equal(Date.now, realNow);
  t.equal(Math.random, realRandom);
  t.end();
});
