import t from 'tap';
import {
  OwnerRetryBudget,
  resolveOwnerRetryBudgetConfig,
} from '../../src/transport/owner-retry-budget.js';

t.test('disabled -> always allows (default-off baseline unchanged)', async (t) => {
  const b = new OwnerRetryBudget({enabled: false, ratePerSec: 1, burst: 1});
  for (let i = 0; i < 100; i += 1) {
    t.equal(b.tryConsume('seed'), true);
  }
});

t.test('enabled -> bounded by burst then refills at rate', async (t) => {
  let nowMs = 0;
  const b = new OwnerRetryBudget({
    enabled: true,
    ratePerSec: 2,
    burst: 3,
    now: () => nowMs,
  });
  // Burst of 3 allowed immediately.
  t.equal(b.tryConsume('seed'), true, '1');
  t.equal(b.tryConsume('seed'), true, '2');
  t.equal(b.tryConsume('seed'), true, '3 (burst)');
  t.equal(b.tryConsume('seed'), false, '4 rate-limited (bucket empty)');

  // 500ms -> 1 token (2/sec).
  nowMs = 500;
  t.equal(b.tryConsume('seed'), true, 'refilled one token after 500ms');
  t.equal(b.tryConsume('seed'), false, 'and only one');

  // Separate keys have independent buckets.
  t.equal(b.tryConsume('other'), true, 'independent target unaffected');
});

t.test('no key -> allowed (defensive)', async (t) => {
  const b = new OwnerRetryBudget({enabled: true, ratePerSec: 1, burst: 1});
  t.equal(b.tryConsume(null), true);
  t.equal(b.tryConsume(''), true);
});

t.test('resolveOwnerRetryBudgetConfig env parsing', async (t) => {
  t.same(
    resolveOwnerRetryBudgetConfig({}),
    {enabled: false, ratePerSec: 2, burst: 4},
    'defaults, disabled',
  );
  t.match(
    resolveOwnerRetryBudgetConfig({
      LAGRANGE_OWNER_RETRY_BUDGET: 'true',
      LAGRANGE_OWNER_RETRY_RATE_PER_SEC: '5',
      LAGRANGE_OWNER_RETRY_BURST: '10',
    }),
    {enabled: true, ratePerSec: 5, burst: 10},
  );
});
