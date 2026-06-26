import t from 'tap';
import {OwnerRetryBudget} from '../../src/transport/owner-retry-budget.js';

t.test('always allows (no-op budget, baseline behavior)', async (t) => {
  const b = new OwnerRetryBudget();
  for (let i = 0; i < 100; i += 1) {
    t.equal(b.tryConsume('seed'), true);
  }
});

t.test('no key -> allowed (defensive)', async (t) => {
  const b = new OwnerRetryBudget();
  t.equal(b.tryConsume(null), true);
  t.equal(b.tryConsume(''), true);
});

t.test('reset is a no-op and stays always-allow', async (t) => {
  const b = new OwnerRetryBudget();
  b.reset('seed');
  b.reset();
  t.equal(b.tryConsume('seed'), true);
});
