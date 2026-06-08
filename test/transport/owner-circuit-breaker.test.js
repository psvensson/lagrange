import t from 'tap';
import {
  BREAKER_STATE,
  OwnerCircuitBreaker,
  resolveOwnerCircuitBreakerConfig,
} from '../../src/transport/owner-circuit-breaker.js';

t.test('disabled -> always allows, record* inert', async (t) => {
  const b = new OwnerCircuitBreaker({enabled: false, failureThreshold: 1});
  b.recordFailure('seed');
  b.recordFailure('seed');
  t.equal(b.allowRequest('seed'), true, 'never opens when disabled');
  t.equal(b.stateOf('seed'), BREAKER_STATE.CLOSED);
});

t.test('opens after threshold, half-open probe after cooldown, closes on success',
  async (t) => {
    let nowMs = 0;
    const b = new OwnerCircuitBreaker({
      enabled: true,
      failureThreshold: 3,
      openMs: 1000,
      now: () => nowMs,
    });
    t.equal(b.allowRequest('seed'), true, 'closed initially');
    b.recordFailure('seed');
    b.recordFailure('seed');
    t.equal(b.stateOf('seed'), BREAKER_STATE.CLOSED, 'below threshold still closed');
    b.recordFailure('seed');
    t.equal(b.stateOf('seed'), BREAKER_STATE.OPEN, 'trips open at threshold');
    t.equal(b.allowRequest('seed'), false, 'open -> requests blocked');

    // Before cooldown: still blocked.
    nowMs = 500;
    t.equal(b.allowRequest('seed'), false, 'still open before cooldown');

    // After cooldown: one half-open probe allowed, then blocked.
    nowMs = 1000;
    t.equal(b.allowRequest('seed'), true, 'half-open probe allowed');
    t.equal(b.stateOf('seed'), BREAKER_STATE.HALF_OPEN);
    t.equal(b.allowRequest('seed'), false, 'only one probe in flight');

    // Probe succeeds -> closed.
    b.recordSuccess('seed');
    t.equal(b.stateOf('seed'), BREAKER_STATE.CLOSED, 'success closes');
    t.equal(b.allowRequest('seed'), true);
  });

t.test('half-open probe failure re-opens', async (t) => {
  let nowMs = 0;
  const b = new OwnerCircuitBreaker({
    enabled: true,
    failureThreshold: 1,
    openMs: 100,
    now: () => nowMs,
  });
  b.recordFailure('seed');
  t.equal(b.stateOf('seed'), BREAKER_STATE.OPEN);
  nowMs = 100;
  t.equal(b.allowRequest('seed'), true, 'half-open probe');
  b.recordFailure('seed');
  t.equal(b.stateOf('seed'), BREAKER_STATE.OPEN, 'probe failure re-opens');
  t.equal(b.allowRequest('seed'), false, 'blocked again until next cooldown');
});

t.test('independent per-key + env config', async (t) => {
  const b = new OwnerCircuitBreaker({enabled: true, failureThreshold: 1, openMs: 1000});
  b.recordFailure('a');
  t.equal(b.allowRequest('a'), false, 'a open');
  t.equal(b.allowRequest('b'), true, 'b independent');

  t.same(
    resolveOwnerCircuitBreakerConfig({}),
    {enabled: false, failureThreshold: 3, openMs: 5000},
    'defaults disabled',
  );
  t.match(
    resolveOwnerCircuitBreakerConfig({
      LAGRANGE_OWNER_CIRCUIT_BREAKER: 'true',
      LAGRANGE_OWNER_CIRCUIT_FAILURE_THRESHOLD: '5',
      LAGRANGE_OWNER_CIRCUIT_OPEN_MS: '8000',
    }),
    {enabled: true, failureThreshold: 5, openMs: 8000},
  );
});
