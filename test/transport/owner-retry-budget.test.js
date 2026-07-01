// OwnerRetryBudget — per-target delivery-triggered reconnect rate budget.
//
// Root: a rejoiner that briefly disconnects (ping/idle timeout) was HAMMERED by
// an unbounded delivery-triggered reconnect storm (~10:1 reconnect:close),
// loading the recovering node so it stayed slow -> sustained disconnect churn ->
// it oscillated in/out of published membership -> topology never converged. The
// rate budget that should have bounded this was gutted to an always-allow no-op.
// These tests pin the restored token bucket; the storm-cap test is red-on-revert
// of the gutting (the no-op admitted every reconnect; the bucket caps the burst).

import t from 'tap';
import {OwnerRetryBudget} from '../../src/transport/owner-retry-budget.js';

const KEY = 'target-node';
const T0 = 1_000_000;

t.test('caps a delivery-triggered reconnect storm to the burst capacity ' +
  '(red-on-revert: the gutted no-op admitted unbounded reconnects)', async (t) => {
  const b = new OwnerRetryBudget({capacityTokens: 6, refillIntervalMs: 1000});
  let allowed = 0;
  for (let i = 0; i < 40; i += 1) {
    if (b.tryConsume(KEY, T0)) {
      allowed += 1;
    }
  }
  t.equal(allowed, 6,
    'only the burst capacity is admitted in an instantaneous storm ' +
    '(the always-allow no-op admitted all 40)');
  t.equal(b.tryConsume(KEY, T0), false, 'burst exhausted -> caller defers');
});

t.test('refills at the configured cadence so a legitimate reconnect is never starved', async (t) => {
  const b = new OwnerRetryBudget({capacityTokens: 6, refillIntervalMs: 1000});
  for (let i = 0; i < 6; i += 1) {
    t.equal(b.tryConsume(KEY, T0), true, 'burst token available');
  }
  t.equal(b.tryConsume(KEY, T0), false, 'exhausted at T0');
  t.equal(b.tryConsume(KEY, T0 + 1000), true,
    'one token refilled after refillIntervalMs -> a genuine reconnect proceeds');
  t.equal(b.tryConsume(KEY, T0 + 1000), false, 'exactly one refilled');
  t.equal(b.tryConsume(KEY, T0 + 3000), true, 'more tokens after more time');
});

t.test('is per-target: a saturated target never starves reconnects to another', async (t) => {
  const b = new OwnerRetryBudget({capacityTokens: 2, refillIntervalMs: 1000});
  t.equal(b.tryConsume('a', T0), true);
  t.equal(b.tryConsume('a', T0), true);
  t.equal(b.tryConsume('a', T0), false, 'target a exhausted');
  t.equal(b.tryConsume('b', T0), true, 'target b has its own full budget');
});

t.test('never rate-limits when there is no target key (defensive)', async (t) => {
  const b = new OwnerRetryBudget({capacityTokens: 1, refillIntervalMs: 1000});
  t.equal(b.tryConsume(null, T0), true);
  t.equal(b.tryConsume('', T0), true);
});

t.test('reset restores a target to full burst', async (t) => {
  const b = new OwnerRetryBudget({capacityTokens: 2, refillIntervalMs: 1000});
  t.equal(b.tryConsume(KEY, T0), true);
  t.equal(b.tryConsume(KEY, T0), true);
  t.equal(b.tryConsume(KEY, T0), false);
  b.reset(KEY);
  t.equal(b.tryConsume(KEY, T0), true, 'reset target starts fresh');
});
