import t from 'tap';
import {
  DEFAULT_RETRY_JITTER_RATIO,
  applyBoundedJitter,
  resolveRetryJitterRatio,
} from '../../src/utils/retry-jitter.js';

t.test('applyBoundedJitter', async (t) => {
  t.equal(
    applyBoundedJitter(1000, 0),
    1000,
    'ratio 0 is identity (default-off baseline unchanged)',
  );
  t.equal(applyBoundedJitter(0, 0.5), 0, 'non-positive delay is returned as-is');
  t.equal(
    applyBoundedJitter(-5, 0.5),
    -5,
    'negative delay is returned as-is',
  );

  // Additive-upward only: never shorter than the backoff, never beyond +ratio.
  for (const r of [0, 0.5, 1]) {
    const lo = applyBoundedJitter(1000, 0.25, () => r);
    t.ok(lo >= 1000, `jittered delay is never below the backoff (r=${r})`);
    t.ok(lo <= 1250, `jittered delay never exceeds delay*(1+ratio) (r=${r})`);
  }
  t.equal(applyBoundedJitter(1000, 0.25, () => 0), 1000, 'rng=0 -> exactly delay');
  t.equal(
    applyBoundedJitter(1000, 0.25, () => 1),
    1250,
    'rng=1 -> delay*(1+ratio)',
  );

  t.equal(
    applyBoundedJitter(1000, 5, () => 1),
    2000,
    'ratio is clamped to 1',
  );
});

t.test('resolveRetryJitterRatio', async (t) => {
  t.equal(resolveRetryJitterRatio({}), 0, 'default off');
  t.equal(
    resolveRetryJitterRatio({LAGRANGE_RETRY_JITTER: 'true'}),
    DEFAULT_RETRY_JITTER_RATIO,
    'flag on -> default ratio',
  );
  t.equal(
    resolveRetryJitterRatio({LAGRANGE_RETRY_JITTER_RATIO: '0.4'}),
    0.4,
    'explicit ratio honored',
  );
  t.equal(
    resolveRetryJitterRatio({LAGRANGE_RETRY_JITTER_RATIO: '2'}),
    0,
    'out-of-range ratio ignored -> off',
  );
});
